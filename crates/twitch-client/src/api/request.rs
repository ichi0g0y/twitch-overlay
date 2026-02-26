use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue};
use serde::Serialize;

use super::*;

impl TwitchApiClient {
    pub fn new(client_id: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            client_id,
        }
    }

    /// Build auth headers from the given token.
    fn auth_headers(&self, token: &Token) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let bearer = format!("Bearer {}", token.access_token);
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&bearer).unwrap());
        headers.insert("Client-Id", HeaderValue::from_str(&self.client_id).unwrap());
        headers
    }

    /// Execute a GET request with auth headers. Retries once on 401.
    pub(super) async fn authenticated_get(
        &self,
        url: &str,
        token: &Token,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.get(url).headers(headers).send().await?;

        let status = resp.status();
        let body = resp.text().await?;

        if status == reqwest::StatusCode::UNAUTHORIZED {
            tracing::warn!(url, "Got 401, caller should refresh token and retry");
            return Err(TwitchError::ApiError {
                status: 401,
                message: body,
            });
        }

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(body)
    }

    /// Execute a PATCH request with auth headers and JSON body.
    pub(super) async fn authenticated_patch(
        &self,
        url: &str,
        token: &Token,
        body: &impl Serialize,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self
            .http
            .patch(url)
            .headers(headers)
            .json(body)
            .send()
            .await?;

        let status = resp.status();
        let resp_body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: resp_body,
            });
        }

        Ok(resp_body)
    }

    /// Execute a POST request with auth headers and JSON body.
    pub(super) async fn authenticated_post(
        &self,
        url: &str,
        token: &Token,
        body: &impl Serialize,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self
            .http
            .post(url)
            .headers(headers)
            .json(body)
            .send()
            .await?;

        let status = resp.status();
        let resp_body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: resp_body,
            });
        }

        Ok(resp_body)
    }

    /// Execute a POST request with auth headers and no body.
    pub(super) async fn authenticated_post_no_body(
        &self,
        url: &str,
        token: &Token,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.post(url).headers(headers).send().await?;

        let status = resp.status();
        let resp_body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: resp_body,
            });
        }

        Ok(resp_body)
    }

    /// Execute a DELETE request with auth headers.
    pub(super) async fn authenticated_delete(
        &self,
        url: &str,
        token: &Token,
    ) -> Result<(), TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.delete(url).headers(headers).send().await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await?;
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(())
    }

    /// Execute a PUT request with auth headers and no body.
    pub(super) async fn authenticated_put_no_body(
        &self,
        url: &str,
        token: &Token,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.put(url).headers(headers).send().await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(body)
    }
}
