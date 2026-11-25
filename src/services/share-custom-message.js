export const SHARE_CUSTOM_MESSAGE_LIMIT = 500;
export const SHARE_CUSTOM_MESSAGE_TOO_LONG = `Custom message must not exceed ${SHARE_CUSTOM_MESSAGE_LIMIT} characters.`;

export function normalizeShareCustomMessage(value) {
    return value.replace(/\r\n?/g, '\n');
}
