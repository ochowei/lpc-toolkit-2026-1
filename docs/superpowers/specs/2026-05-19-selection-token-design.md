# Selection Token Design

## Goal

Add a reversible token that represents the current character part selections, and let users paste that token back into the web UI to restore the character.

## Design

The token format is `v1.<base64url-payload>`. The payload is the existing `serializeHash(selections)` output encoded as Base64URL. This keeps the source of truth in the current reversible hash parser while making the UI-facing value safe to copy, paste, and embed in URLs or messages.

Core exposes:

- `encodeSelectionToken(selections)`: serializes selections and wraps them in a versioned token.
- `decodeSelectionToken(token, catalog, palettes?)`: validates the token version, decodes the payload, and delegates to `parseHash` so catalog validation and warnings stay consistent with existing hash behavior.

The web slice reducer gains an action that applies decoded `Selections` to `SliceState`. It updates `bodyType` and selected item names while preserving animation, direction, and playback state.

The web UI shows the current token, offers a copy button, and provides an input plus apply button. Invalid tokens or tokens that decode with parser warnings show an error and leave the current character unchanged.

## Testing

Core tests cover token round-trip, unsupported versions, malformed payloads, and parser warnings for unknown items. Web selection tests cover applying decoded selections without resetting unrelated preview controls.
