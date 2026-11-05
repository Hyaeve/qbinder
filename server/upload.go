package main

import (
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/zeebo/bencode"
)

type uploadedTorrent struct {
	filename string
	data     []byte
	hashes   []string
}

type uploadTorrentResult struct {
	Filename  string `json:"filename"`
	Status    string `json:"status"`
	Hash      string `json:"hash,omitempty"`
	Name      string `json:"name,omitempty"`
	SavePath  string `json:"savePath,omitempty"`
	NeedsMove bool   `json:"needsMove,omitempty"`
	Error     string `json:"error,omitempty"`
}

type uploadResult struct {
	OK        bool                  `json:"ok"`
	Count     int                   `json:"count"`
	Added     int                   `json:"added"`
	Duplicate int                   `json:"duplicate"`
	Failed    int                   `json:"failed"`
	SavePath  string                `json:"savePath"`
	Results   []uploadTorrentResult `json:"results"`
}

type existingUploadTorrent struct {
	Hash       string `json:"hash"`
	InfoHashV1 string `json:"infohash_v1"`
	InfoHashV2 string `json:"infohash_v2"`
	Name       string `json:"name"`
	SavePath   string `json:"save_path"`
}

func uploadedTorrentHashes(data []byte) ([]string, error) {
	var metadata struct {
		Info bencode.RawMessage `bencode:"info"`
	}
	if err := bencode.DecodeBytes(data, &metadata); err != nil || len(metadata.Info) == 0 {
		return nil, fmt.Errorf("无效的种子文件")
	}
	var info map[string]bencode.RawMessage
	if err := bencode.DecodeBytes(metadata.Info, &info); err != nil {
		return nil, fmt.Errorf("无效的种子信息")
	}
	var hashes []string
	if _, ok := info["pieces"]; ok {
		// Hash the original info bytes; re-encoding can change the torrent identity.
		hash := sha1.Sum(metadata.Info)
		hashes = append(hashes, hex.EncodeToString(hash[:]))
	}
	var version int
	if raw, ok := info["meta version"]; ok {
		if err := bencode.DecodeBytes(raw, &version); err != nil || version != 2 {
			return nil, fmt.Errorf("不支持的种子元数据版本")
		}
		hash := sha256.Sum256(metadata.Info)
		hashes = append(hashes, hex.EncodeToString(hash[:]))
	}
	if len(hashes) == 0 {
		return nil, fmt.Errorf("种子文件缺少 v1/v2 信息")
	}
	return hashes, nil
}

func findUploadedTorrents(ctx context.Context, baseURL, cookie string, hashes []string) (map[string]existingUploadTorrent, error) {
	// qBittorrent uses the first 20 bytes as the ID for a v2-only torrent.
	ids := make([]string, 0, len(hashes))
	for _, hash := range hashes {
		ids = append(ids, hash[:40])
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v2/torrents/info?"+url.Values{"hashes": {strings.Join(ids, "|")}}.Encode(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Cookie", cookie)
	response, err := qBHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("无法检查已有种子：qBittorrent 返回 %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxTorrentListSize+1))
	if err != nil || len(body) > maxTorrentListSize {
		return nil, fmt.Errorf("无法读取已有种子列表")
	}
	var torrents []existingUploadTorrent
	if err := json.Unmarshal(body, &torrents); err != nil {
		return nil, fmt.Errorf("已有种子列表格式无效")
	}
	index := make(map[string]existingUploadTorrent)
	for _, torrent := range torrents {
		for _, hash := range []string{torrent.Hash, torrent.InfoHashV1, torrent.InfoHashV2} {
			if hash != "" {
				index[strings.ToLower(hash)] = torrent
			}
		}
	}
	return index, nil
}

func matchUploadedTorrent(index map[string]existingUploadTorrent, hashes []string) (existingUploadTorrent, bool) {
	for _, hash := range hashes {
		if torrent, ok := index[hash]; ok {
			return torrent, true
		}
		if torrent, ok := index[hash[:40]]; ok {
			return torrent, true
		}
	}
	return existingUploadTorrent{}, false
}

func sameUploadPath(a, b string) bool {
	a = path.Clean(strings.ReplaceAll(strings.TrimSpace(a), "\\", "/"))
	b = path.Clean(strings.ReplaceAll(strings.TrimSpace(b), "\\", "/"))
	if len(a) > 1 && a[1] == ':' {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func addUploadedTorrent(ctx context.Context, baseURL, cookie string, card Card, file uploadedTorrent) error {
	// A buffered multipart body supplies Content-Length to WebUI proxies.
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("torrents", file.filename)
	if err != nil {
		return err
	}
	if _, err = part.Write(file.data); err != nil {
		return err
	}
	for key, value := range map[string]string{"savepath": card.SavePath, "autoTMM": "false", "tags": strings.Join(card.Tags, ",")} {
		if err := writer.WriteField(key, value); err != nil {
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/v2/torrents/add", &body)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Cookie", cookie)
	response, err := qBHTTPClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	message, err := io.ReadAll(io.LimitReader(response.Body, maxQBResponseSize))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("qBittorrent 添加种子失败：%d %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	text := strings.TrimSpace(string(message))
	if text == "Ok." {
		return nil
	}
	var result struct {
		Success int `json:"success_count"`
		Pending int `json:"pending_count"`
	}
	if json.Unmarshal(message, &result) == nil && result.Success+result.Pending > 0 {
		return nil
	}
	return fmt.Errorf("qBittorrent 未接受种子：%s", text)
}

func (s *Server) uploadQBTorrents(w http.ResponseWriter, r *http.Request, account QBAccount, card Card, baseURL, cookie string, headers []*multipart.FileHeader) {
	files := make([]uploadedTorrent, 0, len(headers))
	var hashes []string
	for _, header := range headers {
		file, err := header.Open()
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, maxUploadBodySize+1))
		file.Close()
		if err != nil || len(data) > maxUploadBodySize {
			writeErrorText(w, http.StatusBadRequest, "无法读取种子文件")
			return
		}
		ids, err := uploadedTorrentHashes(data)
		if err != nil {
			writeErrorText(w, http.StatusBadRequest, header.Filename+"："+err.Error())
			return
		}
		files = append(files, uploadedTorrent{filename: header.Filename, data: data, hashes: ids})
		hashes = append(hashes, ids...)
	}
	index, err := findUploadedTorrents(r.Context(), baseURL, cookie, hashes)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	result := uploadResult{OK: true, SavePath: card.SavePath, Results: []uploadTorrentResult{}}
	var addedNames []string
	for _, file := range files {
		item := uploadTorrentResult{Filename: file.filename}
		existing, duplicate := matchUploadedTorrent(index, file.hashes)
		if !duplicate {
			addErr := addUploadedTorrent(r.Context(), baseURL, cookie, card, file)
			// Recheck after submission, including 409/legacy Fails., to resolve races
			// with other clients and detect a different directory without moving it.
			latest, lookupErr := findUploadedTorrents(r.Context(), baseURL, cookie, file.hashes)
			if lookupErr == nil {
				existing, duplicate = matchUploadedTorrent(latest, file.hashes)
			}
			if addErr == nil && (!duplicate || sameUploadPath(existing.SavePath, card.SavePath)) {
				item.Status = "added"
				result.Added++
				addedNames = append(addedNames, file.filename)
				if !duplicate {
					existing = existingUploadTorrent{Hash: file.hashes[0][:40], Name: strings.TrimSuffix(file.filename, path.Ext(file.filename)), SavePath: card.SavePath}
				}
			} else if !duplicate {
				item.Status, item.Error = "failed", addErr.Error()
				result.Failed++
				result.OK = false
			}
		}
		if item.Status == "" {
			item.Status = "duplicate"
			item.Hash, item.Name, item.SavePath = existing.Hash, existing.Name, existing.SavePath
			item.NeedsMove = !sameUploadPath(existing.SavePath, card.SavePath)
			result.Duplicate++
		}
		if item.Status != "failed" {
			for _, hash := range file.hashes {
				index[hash] = existing
			}
		}
		result.Results = append(result.Results, item)
	}
	result.Count = result.Added + result.Duplicate
	if result.Added > 0 {
		s.appendOperationLog(OperationLog{Source: "manual", Status: "success", Action: "addURLs", QBID: account.ID, QBAlias: account.Alias, Target: fmt.Sprintf("通过卡片“%s”添加种子", card.Name), Count: result.Added, TorrentNames: addedNames, Detail: "保存路径：" + card.SavePath})
	}
	writeJSON(w, http.StatusOK, result)
}
