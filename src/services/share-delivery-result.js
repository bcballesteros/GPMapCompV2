export function getShareDeliveryResult(response, result, recipients) {
    const fallback = { success: false, delivered: [], message: 'Unable to share the map. Please try again.' };
    if (!response.ok) return fallback;
    if (!Array.isArray(result?.results)) {
        // Older single-recipient deployments return only success: true.
        if (response.status !== 207 && result?.success === true && recipients.length === 1) {
            return { success: true, delivered: [...recipients], message: 'Map shared successfully with 1 recipient.' };
        }
        return fallback;
    }
    const delivered = recipients.filter(email => {
        const matches = result.results.filter(item => typeof item?.email === 'string'
            && item.email.toLowerCase() === email.toLowerCase());
        return matches.length === 1 && matches[0].status === 'sent';
    });
    if (!delivered.length) return fallback;
    const remaining = recipients.filter(email => !delivered.includes(email));
    const success = response.status !== 207 && result.success === true && !remaining.length;
    return {
        success,
        delivered,
        message: success
            ? `Map shared successfully with ${delivered.length} recipient${delivered.length === 1 ? '' : 's'}.`
            : `Map shared with ${delivered.length} of ${recipients.length} recipients.${remaining.length ? ` Failed: ${remaining.join(', ')}.` : ''}`
    };
}
