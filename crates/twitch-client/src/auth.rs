//! OAuth token management for Twitch authentication.
//!
//! Handles OAuth URL generation, authorization code exchange,
//! token refresh, and automatic token renewal.

use chrono::Utc;
use serde::Deserialize;
use url::Url;

use crate::{SCOPES, Token, TwitchError};

/// Twitch OAuth token response from the token endpoint.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    scope: Option<Vec<String>>,
}

/// Twitch OAuth error response.
#[derive(Debug, Deserialize)]
struct ErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

/// Manages Twitch OAuth authentication.
///
/// The caller is responsible for persisting tokens via the provided callbacks.
/// This struct does not depend on overlay-db directly.
pub struct TwitchAuth {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    http: reqwest::Client,
}

impl TwitchAuth {
    /// Create a new auth manager.
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        Self {
            client_id,
            client_secret,
            redirect_uri,
            http: reqwest::Client::new(),
        }
    }

    /// Generate the OAuth authorization URL with required scopes.
    pub fn get_auth_url(&self) -> Result<String, TwitchError> {
        let scope_str = SCOPES.join(" ");
        let mut url = Url::parse("https://id.twitch.tv/oauth2/authorize")?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("scope", &scope_str)
            .append_pair("force_verify", "true");
        Ok(url.to_string())
    }

    /// Exchange an authorization code for access and refresh tokens.
    pub async fn exchange_code(&self, code: &str) -> Result<Token, TwitchError> {
        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", self.redirect_uri.as_str()),
        ];

        let resp = self
            .http
            .post("https://id.twitch.tv/oauth2/token")
            .form(&params)
            .send()
            .await?;

        self.parse_token_response(resp).await
    }

    /// Refresh an expired token using the refresh token.
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<Token, TwitchError> {
        tracing::info!("Refreshing Twitch OAuth token");

        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ];

        let resp = self
            .http
            .post("https://id.twitch.tv/oauth2/token")
            .form(&params)
            .send()
            .await?;

        self.parse_token_response(resp).await
    }

    /// Get a valid token, auto-refreshing if it expires within 30 minutes.
    ///
    /// Returns `Ok(None)` if refresh is not needed (token is still valid).
    /// Returns `Ok(Some(token))` with the refreshed token if a refresh was performed.
    /// The caller should persist the new token when `Some` is returned.
    pub async fn get_or_refresh_token(
        &self,
        current: &Token,
    ) -> Result<Option<Token>, TwitchError> {
        let now = Utc::now().timestamp();
        let margin = 30 * 60; // 30 minutes

        if now < current.expires_at - margin {
            // Token is still valid with margin
            return Ok(None);
        }

        if current.refresh_token.is_empty() {
            return Err(TwitchError::AuthRequired);
        }

        tracing::info!(
            expires_in_secs = current.expires_at - now,
            "Token expiring soon, refreshing"
        );

        let new_token = self.refresh_token(&current.refresh_token).await?;
        Ok(Some(new_token))
    }

    /// Parse the token endpoint response into a `Token`.
    async fn parse_token_response(&self, resp: reqwest::Response) -> Result<Token, TwitchError> {
        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            let err: ErrorResponse = serde_json::from_str(&body).unwrap_or(ErrorResponse {
                error: Some(status.to_string()),
                error_description: Some(body.clone()),
            });
            return Err(TwitchError::TokenRefreshFailed(format!(
                "{}: {}",
                err.error.unwrap_or_default(),
                err.error_description.unwrap_or_default()
            )));
        }

        let token_resp: TokenResponse = serde_json::from_str(&body).map_err(|e| {
            TwitchError::TokenRefreshFailed(format!("failed to parse response: {e}"))
        })?;

        let scope = token_resp
            .scope
            .map(|s| s.join(" "))
            .unwrap_or_else(|| SCOPES.join(" "));

        let expires_at = Utc::now().timestamp() + token_resp.expires_in;

        Ok(Token {
            access_token: token_resp.access_token,
            refresh_token: token_resp.refresh_token,
            scope,
            expires_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_url_generation() {
        let auth = TwitchAuth::new(
            "test_client_id".into(),
            "test_secret".into(),
            "http://localhost:8080/callback".into(),
        );
        let url = auth.get_auth_url().unwrap();

        assert!(url.starts_with("https://id.twitch.tv/oauth2/authorize"));
        assert!(url.contains("client_id=test_client_id"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("force_verify=true"));
        assert!(url.contains("user%3Aread%3Achat"));
    }

    #[test]
    fn test_get_or_refresh_still_valid() {
        let auth = TwitchAuth::new("id".into(), "secret".into(), "http://localhost".into());
        let token = Token {
            access_token: "abc".into(),
            refresh_token: "def".into(),
            scope: "read".into(),
            expires_at: Utc::now().timestamp() + 7200, // 2 hours from now
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(auth.get_or_refresh_token(&token)).unwrap();
        assert!(result.is_none(), "Should not refresh a valid token");
    }
}
