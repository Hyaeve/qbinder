package main

import (
	"bytes"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/zeebo/bencode"
)

func testTorrent(t *testing.T, name string, version int) []byte {
	t.Helper()
	info := map[string]any{"name": name, "piece length": 16384}
	if version != 2 {
		info["length"], info["pieces"] = 1, strings.Repeat("x", 20)
	}
	if version != 1 {
		info["meta version"] = 2
		info["file tree"] = map[string]any{}
	}
	data, err := bencode.EncodeBytes(map[string]any{"info": info})
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestUploadedTorrentHashes(t *testing.T) {
	for _, version := range []int{1, 2, 3} {
		t.Run(strconv.Itoa(version), func(t *testing.T) {
			data := testTorrent(t, "content", version)
			hashes, err := uploadedTorrentHashes(data)
			if err != nil {
				t.Fatal(err)
			}
			var metadata struct {
				Info bencode.RawMessage `bencode:"info"`
			}
			if err := bencode.DecodeBytes(data, &metadata); err != nil {
				t.Fatal(err)
			}
			v1, v2 := sha1.Sum(metadata.Info), sha256.Sum256(metadata.Info)
			want := []string{}
			if version != 2 {
				want = append(want, hex.EncodeToString(v1[:]))
			}
			if version != 1 {
				want = append(want, hex.EncodeToString(v2[:]))
			}
			if fmt.Sprint(hashes) != fmt.Sprint(want) {
				t.Fatalf("hashes %v, want %v", hashes, want)
			}
		})
	}
	for _, data := range []string{"not a torrent", "de", "d4:infod4:name4:testee"} {
		if _, err := uploadedTorrentHashes([]byte(data)); err == nil {
			t.Fatalf("accepted malformed metadata %q", data)
		}
	}
}

func TestUploadCardDuplicatesAndFailures(t *testing.T) {
	for _, scenario := range []struct {
		name      string
		existing  string
		race      bool
		status    int
		body      string
		version   int
		added     int
		duplicate int
		failed    int
		needsMove bool
		addCalls  int
	}{
		{name: "same path", existing: "/downloads/new/", duplicate: 1},
		{name: "different path", existing: "/downloads/old", duplicate: 1, needsMove: true},
		{name: "v2 truncated id", version: 2, existing: "/downloads/old", duplicate: 1, needsMove: true},
		{name: "hybrid", version: 3, existing: "/downloads/new", duplicate: 1},
		{name: "new legacy", status: 200, body: "Ok.", added: 1, addCalls: 1},
		{name: "new json", status: 200, body: `{"success_count":1,"failure_count":0}`, added: 1, addCalls: 1},
		{name: "409 race", race: true, status: 409, body: "Conflict", duplicate: 1, needsMove: true, addCalls: 1},
		{name: "legacy race", race: true, status: 200, body: "Fails.", duplicate: 1, needsMove: true, addCalls: 1},
		{name: "unrelated 409", status: 409, body: "Conflict", failed: 1, addCalls: 1},
		{name: "legacy failure", status: 200, body: "Fails.", failed: 1, addCalls: 1},
		{name: "json failure", status: 200, body: `{"success_count":0,"failure_count":1}`, failed: 1, addCalls: 1},
		{name: "permission failure", status: 403, body: "Forbidden", failed: 1, addCalls: 1},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			version := scenario.version
			if version == 0 {
				version = 1
			}
			data := testTorrent(t, "renamed content", version)
			hashes, err := uploadedTorrentHashes(data)
			if err != nil {
				t.Fatal(err)
			}
			var mu sync.Mutex
			addCalls, currentPath := 0, scenario.existing
			qb := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				switch r.URL.Path {
				case "/api/v2/auth/login":
					http.SetCookie(w, &http.Cookie{Name: "SID", Value: "test"})
					io.WriteString(w, "Ok.")
				case "/api/v2/torrents/info":
					if !strings.Contains(r.URL.Query().Get("hashes"), hashes[0][:40]) {
						t.Error("missing hash filter")
					}
					items := []existingUploadTorrent{}
					if currentPath != "" {
						items = append(items, existingUploadTorrent{Hash: hashes[0][:40], Name: "existing name", SavePath: currentPath})
					}
					json.NewEncoder(w).Encode(items)
				case "/api/v2/torrents/add":
					addCalls++
					if err := r.ParseMultipartForm(maxUploadBodySize); err != nil {
						t.Error(err)
					}
					defer r.MultipartForm.RemoveAll()
					if r.FormValue("savepath") != "/downloads/new" || r.FormValue("autoTMM") != "false" || r.FormValue("tags") != "movie" || r.ContentLength <= 0 {
						t.Error("lost upload options or Content-Length")
					}
					if scenario.race {
						currentPath = "/downloads/old"
					}
					w.WriteHeader(scenario.status)
					io.WriteString(w, scenario.body)
				default:
					t.Errorf("unexpected mutation: %s", r.URL.Path)
					w.WriteHeader(500)
				}
			}))
			defer qb.Close()
			host, port, _ := net.SplitHostPort(strings.TrimPrefix(qb.URL, "http://"))
			portNumber, _ := strconv.Atoi(port)
			config := Config{Cards: []Card{{ID: "card", QBID: "qb", SavePath: "/downloads/new", Tags: []string{"movie"}}}, QBittorrents: []QBAccount{{ID: "qb", Host: host, Port: portNumber}}}
			server := &Server{logsPath: filepath.Join(t.TempDir(), "logs.json")}
			response := testUploadRequest(t, server, config, [][]byte{data})
			var result uploadResult
			if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil {
				t.Fatalf("unexpected response %d: %s", response.Code, response.Body)
			}
			if result.Added != scenario.added || result.Duplicate != scenario.duplicate || result.Failed != scenario.failed || result.OK != (scenario.failed == 0) {
				t.Fatalf("unexpected counts: %+v", result)
			}
			if len(result.Results) != 1 || result.Results[0].NeedsMove != scenario.needsMove {
				t.Fatalf("unexpected files: %+v", result.Results)
			}
			mu.Lock()
			defer mu.Unlock()
			if addCalls != scenario.addCalls {
				t.Fatalf("add calls %d, want %d", addCalls, scenario.addCalls)
			}
		})
	}
}

func testUploadRequest(t *testing.T, server *Server, config Config, files [][]byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for i, data := range files {
		part, err := writer.CreateFormFile("torrents", fmt.Sprintf("file-%d.torrent", i))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/cards/card/upload", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	server.uploadCard(response, request, config, "card")
	return response
}

func TestSameUploadPath(t *testing.T) {
	if !sameUploadPath(`C:\Downloads\Film\`, `c:/downloads/Film`) || !sameUploadPath("/data/films/", "/data/films") || sameUploadPath("/data/Film", "/data/film") {
		t.Fatal("remote path comparison did not preserve filesystem semantics")
	}
}

func TestUploadCardMixedBatch(t *testing.T) {
	old, fresh, rejected := testTorrent(t, "old", 1), testTorrent(t, "fresh", 1), testTorrent(t, "rejected", 1)
	oldHashes, _ := uploadedTorrentHashes(old)
	var mu sync.Mutex
	items := []existingUploadTorrent{{Hash: oldHashes[0], Name: "old", SavePath: "/downloads/old"}}
	adds := 0
	qb := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch r.URL.Path {
		case "/api/v2/auth/login":
			http.SetCookie(w, &http.Cookie{Name: "SID", Value: "test"})
			io.WriteString(w, "Ok.")
		case "/api/v2/torrents/info":
			json.NewEncoder(w).Encode(items)
		case "/api/v2/torrents/add":
			adds++
			file, _, err := r.FormFile("torrents")
			if err != nil {
				t.Error(err)
				w.WriteHeader(500)
				return
			}
			defer file.Close()
			defer r.MultipartForm.RemoveAll()
			data, _ := io.ReadAll(file)
			if bytes.Equal(data, rejected) {
				w.WriteHeader(409)
				io.WriteString(w, "Conflict")
				return
			}
			hashes, _ := uploadedTorrentHashes(data)
			items = append(items, existingUploadTorrent{Hash: hashes[0], Name: "fresh", SavePath: "/downloads/new"})
			io.WriteString(w, "Ok.")
		default:
			t.Errorf("unexpected mutation %s", r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer qb.Close()
	host, port, _ := net.SplitHostPort(strings.TrimPrefix(qb.URL, "http://"))
	portNumber, _ := strconv.Atoi(port)
	config := Config{Cards: []Card{{ID: "card", QBID: "qb", SavePath: "/downloads/new"}}, QBittorrents: []QBAccount{{ID: "qb", Host: host, Port: portNumber}}}
	server := &Server{logsPath: filepath.Join(t.TempDir(), "logs.json")}
	response := testUploadRequest(t, server, config, [][]byte{old, fresh, fresh, rejected})
	var result uploadResult
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil {
		t.Fatalf("bad response: %s", response.Body)
	}
	if result.Added != 1 || result.Duplicate != 2 || result.Failed != 1 || result.OK {
		t.Fatalf("wrong batch counts: %+v", result)
	}
	if !result.Results[0].NeedsMove || result.Results[2].NeedsMove {
		t.Fatalf("wrong move candidates: %+v", result.Results)
	}
	mu.Lock()
	defer mu.Unlock()
	if adds != 2 {
		t.Fatalf("submitted duplicate files again: %d adds", adds)
	}
}
