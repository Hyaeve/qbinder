package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

type AuthConfig struct {
	Username     string `json:"username"`
	PasswordHash string `json:"passwordHash"`
}

type Session struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type QBAccount struct {
	ID             string `json:"id"`
	Alias          string `json:"alias"`
	Protocol       string `json:"protocol"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	Username       string `json:"username"`
	Password       string `json:"password,omitempty"`
	Cookie         string `json:"cookie,omitempty"`
	LastVerifiedAt string `json:"lastVerifiedAt,omitempty"`
	LastError      string `json:"lastError,omitempty"`
}

type Lane struct {
	ID        string `json:"id"`
	QBID      string `json:"qbId"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type Cover struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type Card struct {
	ID        string   `json:"id"`
	QBID      string   `json:"qbId"`
	LaneID    string   `json:"laneId"`
	Name      string   `json:"name"`
	SavePath  string   `json:"savePath"`
	Tags      []string `json:"tags"`
	Cover     Cover    `json:"cover"`
	CreatedAt string   `json:"createdAt"`
}

type Config struct {
	Auth         AuthConfig  `json:"auth"`
	Sessions     []Session   `json:"sessions"`
	QBittorrents []QBAccount `json:"qbittorrents"`
	Lanes        []Lane      `json:"lanes"`
	Cards        []Card      `json:"cards"`
	TagPool      []string    `json:"tagPool"`
}

type PublicQBAccount struct {
	ID             string `json:"id"`
	Alias          string `json:"alias"`
	Protocol       string `json:"protocol"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	Username       string `json:"username"`
	LastVerifiedAt string `json:"lastVerifiedAt,omitempty"`
	LastError      string `json:"lastError,omitempty"`
}

type PublicConfig struct {
	Username     string            `json:"username"`
	QBittorrents []PublicQBAccount `json:"qbittorrents"`
	Lanes        []Lane            `json:"lanes"`
	Cards        []Card            `json:"cards"`
	TagPool      []string          `json:"tagPool"`
}

type BackupConfig struct {
	Version      int         `json:"version"`
	CreatedAt    string      `json:"createdAt"`
	QBittorrents []QBAccount `json:"qbittorrents"`
	Lanes        []Lane      `json:"lanes"`
	Cards        []Card      `json:"cards"`
	TagPool      []string    `json:"tagPool"`
}

const (
	maxJSONBodySize   = 1 << 20
	maxUploadBodySize = 32 << 20
	maxUploadFiles    = 50
	maxQBResponseSize = 64 << 10
	sessionLifetime   = 14 * 24 * time.Hour
)

var qBHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          32,
		MaxIdleConnsPerHost:   8,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: time.Second,
	},
}

type Server struct {
	mu         sync.Mutex
	configPath string
	distDir    string
}

type qBLoginError struct {
	BaseURL    string
	StatusCode int
	Body       string
	Err        error
}

func (e qBLoginError) Error() string {
	if e.Err != nil {
		return "qBittorrent request failed: " + e.Err.Error()
	}
	if e.StatusCode > 0 {
		return fmt.Sprintf("qBittorrent authentication failed: status=%d body=%q", e.StatusCode, e.Body)
	}
	return "qBittorrent authentication failed"
}

func main() {
	port := env("PORT", "18086")
	dataDir := env("QBINDER_DATA_DIR", "/data")
	server := &Server{
		configPath: filepath.Join(dataDir, "config.json"),
		distDir:    filepath.Join("dist"),
	}
	if err := server.ensureConfig(); err != nil {
		panic(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/login", server.handleLogin)
	mux.HandleFunc("/api/auth/logout", server.withAuth(server.handleLogout))
	mux.HandleFunc("/api/auth/credentials", server.withAuth(server.handleCredentials))
	mux.HandleFunc("/api/config", server.withAuth(server.handleConfig))
	mux.HandleFunc("/api/config/backup", server.withAuth(server.handleConfigBackup))
	mux.HandleFunc("/api/config/restore", server.withAuth(server.handleConfigRestore))
	mux.HandleFunc("/api/qb/test", server.withAuth(server.handleQBTest))
	mux.HandleFunc("/api/qb", server.withAuth(server.handleQBCreate))
	mux.HandleFunc("/api/qb/", server.withAuth(server.handleQBDelete))
	mux.HandleFunc("/api/lanes", server.withAuth(server.handleLanes))
	mux.HandleFunc("/api/lanes/", server.withAuth(server.handleLaneSubroutes))
	mux.HandleFunc("/api/cards", server.withAuth(server.handleCards))
	mux.HandleFunc("/api/cards/", server.withAuth(server.handleCardSubroutes))
	mux.HandleFunc("/api/tags/", server.withAuth(server.handleTagSubroutes))
	mux.HandleFunc("/", server.handleStatic)

	handler := securityHeaders(mux)
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       45 * time.Second,
		WriteTimeout:      45 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	fmt.Printf("qBinder listening on %s\n", port)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}

func env(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func (s *Server) ensureConfig() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.configPath), 0700); err != nil {
		return err
	}
	if _, err := os.Stat(s.configPath); err == nil {
		return nil
	}
	config := Config{
		Auth:     AuthConfig{Username: "qBinder", PasswordHash: hashPassword("qBinder")},
		Sessions: []Session{}, QBittorrents: []QBAccount{}, Lanes: []Lane{}, Cards: []Card{}, TagPool: []string{},
	}
	return s.writeConfigLocked(config)
}

func (s *Server) readConfig() (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readConfigLocked()
}

func (s *Server) readConfigLocked() (Config, error) {
	content, err := os.ReadFile(s.configPath)
	if err != nil {
		return Config{}, err
	}
	var config Config
	if err := json.Unmarshal(content, &config); err != nil {
		return Config{}, err
	}
	return normalizeConfig(config), nil
}

func (s *Server) writeConfig(config Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeConfigLocked(config)
}

func (s *Server) writeConfigLocked(config Config) error {
	content, err := json.MarshalIndent(normalizeConfig(config), "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(s.configPath)
	temporary, err := os.CreateTemp(dir, ".config-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, s.configPath)
}

func normalizeConfig(config Config) Config {
	if config.Auth.Username == "" {
		config.Auth.Username = "qBinder"
	}
	if config.Auth.PasswordHash == "" {
		config.Auth.PasswordHash = hashPassword("qBinder")
	}
	if config.Sessions == nil {
		config.Sessions = []Session{}
	}
	if config.QBittorrents == nil {
		config.QBittorrents = []QBAccount{}
	}
	if config.Lanes == nil {
		config.Lanes = []Lane{}
	}
	if config.Cards == nil {
		config.Cards = []Card{}
	}
	if config.TagPool == nil {
		config.TagPool = []string{}
	}
	return config
}

func publicConfig(config Config) PublicConfig {
	accounts := make([]PublicQBAccount, 0, len(config.QBittorrents))
	for _, item := range config.QBittorrents {
		accounts = append(accounts, PublicQBAccount{ID: item.ID, Alias: item.Alias, Protocol: item.Protocol, Host: item.Host, Port: item.Port, Username: item.Username, LastVerifiedAt: item.LastVerifiedAt, LastError: item.LastError})
	}
	return PublicConfig{Username: config.Auth.Username, QBittorrents: accounts, Lanes: config.Lanes, Cards: config.Cards, TagPool: config.TagPool}
}

func (s *Server) withAuth(next func(http.ResponseWriter, *http.Request, Config, Session)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		config, err := s.readConfig()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		cookie, err := r.Cookie("qbinder_session")
		if err != nil {
			writeErrorText(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		now := time.Now()
		for _, session := range config.Sessions {
			if session.Token == cookie.Value && session.ExpiresAt.After(now) {
				next(w, r, config, session)
				return
			}
		}
		writeErrorText(w, http.StatusUnauthorized, "Unauthorized")
	}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var payload struct{ Username, Password string }
	if !decodeJSON(w, r, &payload) {
		return
	}
	config, err := s.readConfig()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if payload.Username != config.Auth.Username || !verifyPassword(payload.Password, config.Auth.PasswordHash) {
		writeErrorText(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}
	if passwordNeedsUpgrade(config.Auth.PasswordHash) {
		config.Auth.PasswordHash = hashPassword(payload.Password)
	}
	token := randomID()
	session := Session{Token: token, ExpiresAt: time.Now().Add(sessionLifetime)}
	config.Sessions = append(activeSessions(config.Sessions), session)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "qbinder_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: int(sessionLifetime.Seconds())})
	writeJSON(w, http.StatusOK, map[string]any{"user": map[string]string{"username": config.Auth.Username}, "config": publicConfig(config)})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	next := make([]Session, 0, len(config.Sessions))
	for _, item := range config.Sessions {
		if item.Token != session.Token {
			next = append(next, item)
		}
	}
	config.Sessions = next
	// Always clear the browser session first. A read-only or permission-restricted
	// bind mount must never prevent the current browser from signing out.
	http.SetCookie(w, &http.Cookie{Name: "qbinder_session", Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	if err := s.writeConfig(config); err != nil {
		log.Printf("logout session persistence failed: %v", err)
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true, "persisted": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true, "persisted": true})
}

func (s *Server) handleCredentials(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}
	var payload struct{ Username, Password string }
	if !decodeJSON(w, r, &payload) {
		return
	}
	if strings.TrimSpace(payload.Username) == "" || strings.TrimSpace(payload.Password) == "" {
		writeErrorText(w, http.StatusBadRequest, "Missing fields: username, password")
		return
	}
	config.Auth.Username = strings.TrimSpace(payload.Username)
	config.Auth.PasswordHash = hashPassword(payload.Password)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": config.Auth.Username})
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleConfigBackup(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	backup := BackupConfig{
		Version:      1,
		CreatedAt:    time.Now().Format(time.RFC3339),
		QBittorrents: config.QBittorrents,
		Lanes:        config.Lanes,
		Cards:        config.Cards,
		TagPool:      config.TagPool,
	}
	w.Header().Set("Content-Disposition", `attachment; filename="qbinder-backup.json"`)
	writeJSON(w, http.StatusOK, backup)
}

func (s *Server) handleConfigRestore(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var backup BackupConfig
	if !decodeJSON(w, r, &backup) {
		return
	}
	config.QBittorrents = normalizeBackupQBAccounts(backup.QBittorrents)
	config.Lanes = normalizeBackupLanes(backup.Lanes, config.QBittorrents)
	config.Cards = normalizeBackupCards(backup.Cards, config.QBittorrents, config.Lanes)
	config.TagPool = mergeTags(backup.TagPool, collectCardTags(config.Cards))
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleQBTest(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var payload QBAccount
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := validateQB(payload, true); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if _, _, err := loginQB(payload); err != nil {
		logQBFailure("verify", payload, err)
		writeError(w, http.StatusBadRequest, err)
		return
	}
	logQBEvent("verify_success", payload, "qBittorrent connection verified")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleQBCreate(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var payload QBAccount
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := validateQB(payload, true); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	account := normalizeQBAccount(payload)
	account.ID = randomID()
	if _, cookie, err := loginQB(account); err != nil {
		account.Cookie = ""
		account.LastVerifiedAt = ""
		account.LastError = err.Error()
		logQBFailure("account_verify_on_save", account, err)
	} else {
		account.Cookie = cookie
		account.LastVerifiedAt = time.Now().Format(time.RFC3339)
		account.LastError = ""
		logQBEvent("account_verified_on_save", account, "qBittorrent account saved and verified")
	}
	config.QBittorrents = append(config.QBittorrents, account)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleQBDelete(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	id := strings.TrimPrefix(r.URL.Path, "/api/qb/")
	if r.Method == http.MethodPut {
		s.updateQB(w, r, config, id)
		return
	}
	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	config.QBittorrents = filterQB(config.QBittorrents, id)
	config.Lanes = filterLanes(config.Lanes, id)
	config.Cards = filterCardsByQB(config.Cards, id)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) updateQB(w http.ResponseWriter, r *http.Request, config Config, id string) {
	var payload QBAccount
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := validateQB(payload, false); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	for index := range config.QBittorrents {
		if config.QBittorrents[index].ID == id {
			updated := normalizeQBAccount(payload)
			updated.ID = id
			if strings.TrimSpace(updated.Password) == "" {
				updated.Password = config.QBittorrents[index].Password
			}
			updated.Cookie = ""
			updated.LastVerifiedAt = ""
			updated.LastError = ""
			config.QBittorrents[index] = updated
			if err := s.writeConfig(config); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			writeJSON(w, http.StatusOK, publicConfig(config))
			return
		}
	}
	writeErrorText(w, http.StatusNotFound, "qBittorrent account not found")
}

func (s *Server) handleLanes(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var payload struct {
		QBID string `json:"qbId"`
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if strings.TrimSpace(payload.QBID) == "" || strings.TrimSpace(payload.Name) == "" {
		writeErrorText(w, http.StatusBadRequest, "Missing fields: qbId, name")
		return
	}
	lane := Lane{ID: randomID(), QBID: payload.QBID, Name: strings.TrimSpace(payload.Name), CreatedAt: time.Now().Format(time.RFC3339)}
	config.Lanes = append(config.Lanes, lane)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleLaneSubroutes(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	id := strings.TrimPrefix(r.URL.Path, "/api/lanes/")
	if r.Method == http.MethodPut {
		s.updateLane(w, r, config, id)
		return
	}
	if r.Method == http.MethodDelete {
		s.deleteLane(w, config, id)
		return
	}
	methodNotAllowed(w)
}

func (s *Server) updateLane(w http.ResponseWriter, r *http.Request, config Config, id string) {
	var payload struct {
		Name        string `json:"name"`
		Direction   string `json:"direction"`
		TargetIndex *int   `json:"targetIndex"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	laneIndex := findLaneIndex(config.Lanes, id)
	if laneIndex < 0 {
		writeErrorText(w, http.StatusNotFound, "Lane not found")
		return
	}
	if strings.TrimSpace(payload.Name) != "" {
		config.Lanes[laneIndex].Name = strings.TrimSpace(payload.Name)
	}
	if payload.TargetIndex != nil {
		config.Lanes = moveLaneToIndex(config.Lanes, laneIndex, *payload.TargetIndex)
	} else {
		switch payload.Direction {
		case "up":
			config.Lanes = moveLaneByDirection(config.Lanes, laneIndex, -1)
		case "down":
			config.Lanes = moveLaneByDirection(config.Lanes, laneIndex, 1)
		case "", "none":
		default:
			writeErrorText(w, http.StatusBadRequest, "Invalid lane direction")
			return
		}
	}
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) deleteLane(w http.ResponseWriter, config Config, id string) {
	if findLaneIndex(config.Lanes, id) < 0 {
		writeErrorText(w, http.StatusNotFound, "Lane not found")
		return
	}
	config.Lanes = filterLaneByID(config.Lanes, id)
	config.Cards = filterCardsByLane(config.Cards, id)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleCards(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var card Card
	if !decodeJSON(w, r, &card) {
		return
	}
	if strings.TrimSpace(card.QBID) == "" || strings.TrimSpace(card.LaneID) == "" || strings.TrimSpace(card.Name) == "" {
		writeErrorText(w, http.StatusBadRequest, "Missing fields: qbId, laneId, name")
		return
	}
	card.ID = randomID()
	card.CreatedAt = time.Now().Format(time.RFC3339)
	if card.Tags == nil {
		card.Tags = []string{}
	}
	if card.Cover.Type == "" {
		card.Cover = Cover{Type: "monet", Value: ""}
	}
	config.Cards = append(config.Cards, card)
	config.TagPool = mergeTags(config.TagPool, card.Tags)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleCardSubroutes(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/cards/"), "/")
	if len(parts) == 1 && r.Method == http.MethodPut {
		s.updateCard(w, r, config, parts[0])
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		s.deleteCard(w, config, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "upload" && r.Method == http.MethodPost {
		s.uploadCard(w, r, config, parts[0])
		return
	}
	methodNotAllowed(w)
}

func (s *Server) updateCard(w http.ResponseWriter, r *http.Request, config Config, id string) {
	var payload Card
	if !decodeJSON(w, r, &payload) {
		return
	}
	for index := range config.Cards {
		if config.Cards[index].ID == id {
			config.Cards[index].Name = fallback(payload.Name, config.Cards[index].Name)
			config.Cards[index].SavePath = payload.SavePath
			if payload.Tags != nil {
				config.Cards[index].Tags = payload.Tags
			}
			if payload.Cover.Type != "" {
				config.Cards[index].Cover = payload.Cover
			}
			config.TagPool = mergeTags(config.TagPool, config.Cards[index].Tags)
			if err := s.writeConfig(config); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			writeJSON(w, http.StatusOK, publicConfig(config))
			return
		}
	}
	writeErrorText(w, http.StatusNotFound, "Card not found")
}

func (s *Server) deleteCard(w http.ResponseWriter, config Config, id string) {
	if _, ok := findCard(config.Cards, id); !ok {
		writeErrorText(w, http.StatusNotFound, "Card not found")
		return
	}
	config.Cards = filterCardByID(config.Cards, id)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) handleTagSubroutes(w http.ResponseWriter, r *http.Request, config Config, session Session) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	tag, err := url.PathUnescape(strings.TrimPrefix(r.URL.Path, "/api/tags/"))
	if err != nil || strings.TrimSpace(tag) == "" {
		writeErrorText(w, http.StatusBadRequest, "Tag is required")
		return
	}
	config.TagPool = filterTag(config.TagPool, tag)
	if err := s.writeConfig(config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicConfig(config))
}

func (s *Server) uploadCard(w http.ResponseWriter, r *http.Request, config Config, id string) {
	card, ok := findCard(config.Cards, id)
	if !ok {
		writeErrorText(w, http.StatusNotFound, "Card not found")
		return
	}
	if strings.TrimSpace(card.SavePath) == "" {
		writeErrorText(w, http.StatusBadRequest, "Card save path is required")
		return
	}
	account, ok := findQB(config.QBittorrents, card.QBID)
	if !ok {
		writeErrorText(w, http.StatusNotFound, "qBittorrent account not found")
		return
	}
	baseURL, cookie, err := loginQB(account)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBodySize)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeErrorText(w, http.StatusBadRequest, "Invalid or oversized torrent upload")
		return
	}
	defer r.MultipartForm.RemoveAll()
	files := r.MultipartForm.File["torrents"]
	if len(files) == 0 || len(files) > maxUploadFiles {
		writeErrorText(w, http.StatusBadRequest, "Select between 1 and 50 torrent files")
		return
	}
	for _, header := range files {
		if !strings.HasSuffix(strings.ToLower(header.Filename), ".torrent") {
			writeErrorText(w, http.StatusBadRequest, "Only .torrent files are supported")
			return
		}
	}

	pipeReader, pipeWriter := io.Pipe()
	writer := multipart.NewWriter(pipeWriter)
	writeDone := make(chan error, 1)
	go func() {
		defer pipeWriter.Close()
		for _, header := range files {
			file, err := header.Open()
			if err != nil {
				writeDone <- err
				return
			}
			part, err := writer.CreateFormFile("torrents", header.Filename)
			if err == nil {
				_, err = io.Copy(part, file)
			}
			file.Close()
			if err != nil {
				pipeWriter.CloseWithError(err)
				writeDone <- err
				return
			}
		}
		if err := writer.WriteField("savepath", card.SavePath); err == nil {
			err = writer.WriteField("autoTMM", "false")
		}
		if err == nil && len(card.Tags) > 0 {
			err = writer.WriteField("tags", strings.Join(card.Tags, ","))
		}
		if err == nil {
			err = writer.Close()
		}
		writeDone <- err
	}()

	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, baseURL+"/api/v2/torrents/add", pipeReader)
	if err != nil {
		pipeReader.Close()
		<-writeDone
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Cookie", cookie)
	response, err := qBHTTPClient.Do(request)
	pipeReader.Close()
	writeErr := <-writeDone
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if writeErr != nil {
		writeError(w, http.StatusBadRequest, writeErr)
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeErrorText(w, http.StatusBadGateway, fmt.Sprintf("qBittorrent add torrents failed: %d", response.StatusCode))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(files)})
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeErrorText(w, http.StatusNotFound, "Not found")
		return
	}
	requestedPath := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	path := filepath.Join(s.distDir, requestedPath)
	if relative, err := filepath.Rel(s.distDir, path); err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			if strings.Contains(filepath.Base(path), ".") {
				w.Header().Set("Cache-Control", "public, max-age=86400")
			}
			http.ServeFile(w, r, path)
			return
		}
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(s.distDir, "index.html"))
}

func validateQB(account QBAccount, requirePassword bool) error {
	missing := []string{}
	if strings.TrimSpace(account.Alias) == "" {
		missing = append(missing, "alias")
	}
	if strings.TrimSpace(account.Host) == "" {
		missing = append(missing, "host")
	}
	if account.Port <= 0 {
		missing = append(missing, "port")
	}
	if strings.TrimSpace(account.Username) == "" {
		missing = append(missing, "username")
	}
	if requirePassword && strings.TrimSpace(account.Password) == "" {
		missing = append(missing, "password")
	}
	if len(missing) > 0 {
		return errors.New("Missing fields: " + strings.Join(missing, ", "))
	}
	return nil
}

func normalizeQBAccount(account QBAccount) QBAccount {
	protocol := strings.ToLower(strings.TrimSpace(account.Protocol))
	if protocol == "" {
		protocol = "http"
	}
	return QBAccount{
		Alias:    strings.TrimSpace(account.Alias),
		Protocol: protocol,
		Host:     cleanHost(account.Host),
		Port:     account.Port,
		Username: strings.TrimSpace(account.Username),
		Password: account.Password,
	}
}

func loginQB(account QBAccount) (string, string, error) {
	protocol := strings.ToLower(strings.TrimSpace(account.Protocol))
	if protocol == "" {
		protocol = "http"
	}
	if protocol != "http" && protocol != "https" {
		return "", "", errors.New("qBittorrent protocol must be http or https")
	}
	baseURL := protocol + "://" + cleanHost(account.Host) + ":" + strconv.Itoa(account.Port)
	logQBEvent("login_start", account, "attempting qBittorrent WebUI login at "+baseURL+"/api/v2/auth/login")
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Timeout: 8 * time.Second, Jar: jar, Transport: qBHTTPClient.Transport}
	form := url.Values{"username": {account.Username}, "password": {account.Password}}
	response, err := client.PostForm(baseURL+"/api/v2/auth/login", form)
	if err != nil {
		return "", "", qBLoginError{BaseURL: baseURL, Err: err}
	}
	defer response.Body.Close()
	content, readErr := io.ReadAll(io.LimitReader(response.Body, maxQBResponseSize))
	if readErr != nil {
		return "", "", qBLoginError{BaseURL: baseURL, Err: readErr}
	}
	body := strings.TrimSpace(string(content))
	cookies := []string{}
	for _, cookie := range response.Cookies() {
		cookies = append(cookies, cookie.Name+"="+cookie.Value)
	}
	logQBEvent("login_response", account, fmt.Sprintf("status=%d body=%q cookies=%d", response.StatusCode, truncateLog(body, 500), len(cookies)))
	if len(cookies) == 0 {
		return "", "", qBLoginError{BaseURL: baseURL, StatusCode: response.StatusCode, Body: "qBittorrent did not return a session cookie; response body=" + truncateLog(body, 500)}
	}
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusNoContent {
		return "", "", qBLoginError{BaseURL: baseURL, StatusCode: response.StatusCode, Body: truncateLog(body, 500)}
	}
	if response.StatusCode == http.StatusOK && body != "Ok." {
		return "", "", qBLoginError{BaseURL: baseURL, StatusCode: response.StatusCode, Body: truncateLog(body, 500)}
	}
	return baseURL, strings.Join(cookies, "; "), nil
}

func logQBEvent(action string, account QBAccount, message string) {
	log.Printf("qb action=%s alias=%q protocol=%s host=%s port=%d username=%q message=%s", action, account.Alias, fallback(account.Protocol, "http"), cleanHost(account.Host), account.Port, account.Username, message)
}

func logQBFailure(action string, account QBAccount, err error) {
	if details, ok := err.(qBLoginError); ok {
		log.Printf("qb action=%s alias=%q protocol=%s host=%s port=%d username=%q base_url=%s status=%d body=%q error=%v", action, account.Alias, fallback(account.Protocol, "http"), cleanHost(account.Host), account.Port, account.Username, details.BaseURL, details.StatusCode, details.Body, details.Err)
		return
	}
	log.Printf("qb action=%s alias=%q protocol=%s host=%s port=%d username=%q error=%v", action, account.Alias, fallback(account.Protocol, "http"), cleanHost(account.Host), account.Port, account.Username, err)
}

func truncateLog(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "..."
}

func cleanHost(host string) string {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimPrefix(host, "https://")
	return strings.TrimRight(host, "/")
}

func activeSessions(sessions []Session) []Session {
	now := time.Now()
	active := []Session{}
	for _, session := range sessions {
		if session.ExpiresAt.After(now) {
			active = append(active, session)
		}
	}
	return active
}

func hashPassword(password string) string {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		panic("failed to generate password salt: " + err.Error())
	}
	const iterations uint32 = 3
	const memory uint32 = 64 * 1024
	const parallelism uint8 = 2
	key := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, 32)
	return fmt.Sprintf("argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", memory, iterations, parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key))
}

func verifyPassword(password string, encoded string) bool {
	if strings.HasPrefix(encoded, "$2") {
		return bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password)) == nil
	}
	if strings.HasPrefix(encoded, "sha256$") {
		parts := strings.Split(encoded, "$")
		if len(parts) != 3 {
			return false
		}
		sum := sha256.Sum256([]byte(parts[1] + ":" + password))
		return subtle.ConstantTimeCompare([]byte(hex.EncodeToString(sum[:])), []byte(parts[2])) == 1
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 || parts[0] != "argon2id" || parts[1] != "v=19" {
		return false
	}
	var memory, iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil || memory < 8*1024 || iterations == 0 || parallelism == 0 || memory > 256*1024 || iterations > 10 || parallelism > 8 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(salt) < 16 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(expected) != 32 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func passwordNeedsUpgrade(encoded string) bool {
	return !strings.HasPrefix(encoded, "argon2id$v=19$")
}

func randomID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		panic("failed to generate secure random ID: " + err.Error())
	}
	return hex.EncodeToString(buffer)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodySize)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		writeErrorText(w, http.StatusBadRequest, "Invalid JSON request")
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeErrorText(w, http.StatusBadRequest, "JSON request must contain one object")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeErrorText(w, status, err.Error())
}

func writeErrorText(w http.ResponseWriter, status int, message string) {
	log.Printf("api_error status=%d message=%q", status, message)
	writeJSON(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter) {
	w.Header().Set("Allow", "GET, POST, PUT, DELETE")
	writeErrorText(w, http.StatusMethodNotAllowed, "Method not allowed")
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'")
		next.ServeHTTP(w, r)
	})
}

func fallback(value string, current string) string {
	if strings.TrimSpace(value) == "" {
		return current
	}
	return strings.TrimSpace(value)
}

func mergeTags(pool []string, tags []string) []string {
	seen := map[string]bool{}
	merged := []string{}
	for _, tag := range append(pool, tags...) {
		tag = strings.TrimSpace(tag)
		if tag != "" && !seen[tag] {
			seen[tag] = true
			merged = append(merged, tag)
		}
	}
	return merged
}

func collectCardTags(cards []Card) []string {
	tags := []string{}
	for _, card := range cards {
		tags = append(tags, card.Tags...)
	}
	return tags
}

func normalizeBackupQBAccounts(accounts []QBAccount) []QBAccount {
	normalized := []QBAccount{}
	seen := map[string]bool{}
	for _, account := range accounts {
		item := account
		item.ID = strings.TrimSpace(item.ID)
		if item.ID == "" || seen[item.ID] {
			item.ID = randomID()
		}
		seen[item.ID] = true
		item.Alias = strings.TrimSpace(item.Alias)
		if item.Alias == "" {
			item.Alias = "qBittorrent"
		}
		item.Protocol = fallback(item.Protocol, "http")
		item.Host = cleanHost(item.Host)
		item.Username = strings.TrimSpace(item.Username)
		item.Cookie = ""
		item.LastError = ""
		normalized = append(normalized, item)
	}
	return normalized
}

func normalizeBackupLanes(lanes []Lane, accounts []QBAccount) []Lane {
	accountIDs := map[string]bool{}
	for _, account := range accounts {
		accountIDs[account.ID] = true
	}
	normalized := []Lane{}
	seen := map[string]bool{}
	for _, lane := range lanes {
		if !accountIDs[lane.QBID] {
			continue
		}
		item := lane
		item.ID = strings.TrimSpace(item.ID)
		if item.ID == "" || seen[item.ID] {
			item.ID = randomID()
		}
		seen[item.ID] = true
		item.Name = strings.TrimSpace(item.Name)
		if item.Name == "" {
			item.Name = "未命名横栏"
		}
		if strings.TrimSpace(item.CreatedAt) == "" {
			item.CreatedAt = time.Now().Format(time.RFC3339)
		}
		normalized = append(normalized, item)
	}
	return normalized
}

func normalizeBackupCards(cards []Card, accounts []QBAccount, lanes []Lane) []Card {
	accountIDs := map[string]bool{}
	for _, account := range accounts {
		accountIDs[account.ID] = true
	}
	laneIDs := map[string]bool{}
	for _, lane := range lanes {
		laneIDs[lane.ID] = true
	}
	normalized := []Card{}
	seen := map[string]bool{}
	for _, card := range cards {
		if !accountIDs[card.QBID] || !laneIDs[card.LaneID] {
			continue
		}
		item := card
		item.ID = strings.TrimSpace(item.ID)
		if item.ID == "" || seen[item.ID] {
			item.ID = randomID()
		}
		seen[item.ID] = true
		item.Name = strings.TrimSpace(item.Name)
		if item.Name == "" {
			item.Name = "未命名卡片"
		}
		if item.Tags == nil {
			item.Tags = []string{}
		}
		if strings.TrimSpace(item.Cover.Type) == "" {
			item.Cover = Cover{Type: "monet", Value: ""}
		}
		if strings.TrimSpace(item.CreatedAt) == "" {
			item.CreatedAt = time.Now().Format(time.RFC3339)
		}
		normalized = append(normalized, item)
	}
	return normalized
}

func findQB(accounts []QBAccount, id string) (QBAccount, bool) {
	for _, account := range accounts {
		if account.ID == id {
			return account, true
		}
	}
	return QBAccount{}, false
}

func findCard(cards []Card, id string) (Card, bool) {
	for _, card := range cards {
		if card.ID == id {
			return card, true
		}
	}
	return Card{}, false
}

func findLaneIndex(lanes []Lane, id string) int {
	for index := range lanes {
		if lanes[index].ID == id {
			return index
		}
	}
	return -1
}

func moveLaneByDirection(lanes []Lane, laneIndex int, step int) []Lane {
	for index := laneIndex + step; index >= 0 && index < len(lanes); index += step {
		if lanes[index].QBID == lanes[laneIndex].QBID {
			lanes[index], lanes[laneIndex] = lanes[laneIndex], lanes[index]
			break
		}
	}
	return lanes
}

func moveLaneToIndex(lanes []Lane, laneIndex int, targetIndex int) []Lane {
	lane := lanes[laneIndex]
	if targetIndex < 0 {
		targetIndex = 0
	}
	currentLocalIndex := 0
	for index := 0; index < laneIndex; index++ {
		if lanes[index].QBID == lane.QBID {
			currentLocalIndex++
		}
	}
	if currentLocalIndex < targetIndex {
		targetIndex--
	}
	if targetIndex < 0 {
		targetIndex = 0
	}
	withoutLane := append(append([]Lane{}, lanes[:laneIndex]...), lanes[laneIndex+1:]...)
	insertAt := len(withoutLane)
	localIndex := 0
	for index := range withoutLane {
		if withoutLane[index].QBID != lane.QBID {
			continue
		}
		if localIndex == targetIndex {
			insertAt = index
			break
		}
		localIndex++
	}
	withoutLane = append(withoutLane, Lane{})
	copy(withoutLane[insertAt+1:], withoutLane[insertAt:])
	withoutLane[insertAt] = lane
	return withoutLane
}

func filterQB(accounts []QBAccount, id string) []QBAccount {
	next := []QBAccount{}
	for _, item := range accounts {
		if item.ID != id {
			next = append(next, item)
		}
	}
	return next
}

func filterLanes(lanes []Lane, qbID string) []Lane {
	next := []Lane{}
	for _, item := range lanes {
		if item.QBID != qbID {
			next = append(next, item)
		}
	}
	return next
}

func filterLaneByID(lanes []Lane, id string) []Lane {
	next := []Lane{}
	for _, item := range lanes {
		if item.ID != id {
			next = append(next, item)
		}
	}
	return next
}

func filterCardsByQB(cards []Card, qbID string) []Card {
	next := []Card{}
	for _, item := range cards {
		if item.QBID != qbID {
			next = append(next, item)
		}
	}
	return next
}

func filterCardsByLane(cards []Card, laneID string) []Card {
	next := []Card{}
	for _, item := range cards {
		if item.LaneID != laneID {
			next = append(next, item)
		}
	}
	return next
}

func filterCardByID(cards []Card, id string) []Card {
	next := []Card{}
	for _, item := range cards {
		if item.ID != id {
			next = append(next, item)
		}
	}
	return next
}

func filterTag(tags []string, target string) []string {
	next := []string{}
	for _, tag := range tags {
		if tag != target {
			next = append(next, tag)
		}
	}
	return next
}
