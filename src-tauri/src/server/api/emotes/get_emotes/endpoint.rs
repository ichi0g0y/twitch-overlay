/// GET /api/emotes?channels=foo,bar&priority_channel=baz
pub async fn get_emotes(
    State(state): State<SharedState>,
    Query(query): Query<EmotesQuery>,
) -> ApiResult {
    let Some(mut ctx) = EmoteApiContext::from_request(&state, &query).await else {
        return Ok(empty_emotes_payload());
    };

    let user_state = load_user_emote_state(&mut ctx).await;
    let target_channels = build_target_channels(&ctx, &user_state);

    let mut groups_by_id: HashMap<String, EmoteGroup> = HashMap::new();
    append_user_emotes_to_groups(&mut ctx, &user_state, &mut groups_by_id);
    append_global_emotes_if_needed(&ctx, &user_state, &mut groups_by_id).await;
    append_channel_emotes(&mut ctx, &user_state, target_channels, &mut groups_by_id).await;

    Ok(build_response_payload(groups_by_id, &ctx, &user_state))
}
