package webserver

import "net/http"

// RegisterPresentRoutes はプレゼントルーレット関連のルートを登録
func RegisterPresentRoutes(mux *http.ServeMux) {
	// API endpoints
	mux.HandleFunc("/api/present/test", corsMiddleware(handlePresentTest))
	mux.HandleFunc("/api/present/participants", corsMiddleware(handlePresentParticipants))
	mux.HandleFunc("/api/present/participants/", corsMiddleware(handlePresentParticipant))
	mux.HandleFunc("/api/present/start", corsMiddleware(handlePresentStart))
	mux.HandleFunc("/api/present/stop", corsMiddleware(handlePresentStop))
	mux.HandleFunc("/api/present/clear", corsMiddleware(handlePresentClear))
	mux.HandleFunc("/api/present/lock", corsMiddleware(handlePresentLock))
	mux.HandleFunc("/api/present/unlock", corsMiddleware(handlePresentUnlock))
	mux.HandleFunc("/api/present/refresh-subscribers", corsMiddleware(handleRefreshSubscribers))

	// /presentパスはSPAのフォールバック処理に任せる
}
