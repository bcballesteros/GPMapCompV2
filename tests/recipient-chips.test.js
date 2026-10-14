import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRecipients, splitRecipients, RECIPIENT_LIMIT_MESSAGE } from '../src/ui/recipient-chips.js';
import { getShareDeliveryResult } from '../src/services/share-delivery-result.js';

test('recipient validation trims, matches backend rules, rejects duplicates and enforces five', () => {
    const valid = ['user@example.com', 'first.last@example.com', 'user+tag@example.com', 'user@namria.gov.ph', 'first.last@subdomain.example.com'];
    assert.deepEqual(validateRecipients(valid), valid);
    assert.deepEqual(validateRecipients(['user@example.tr']), ['user@example.tr']);
    assert.deepEqual(validateRecipients([' a@example.com ']), ['a@example.com']);
    assert.deepEqual(splitRecipients('a@example.com, b@example.com;c@example.com\nd@example.com\t e@example.com'),
        ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com']);
    for (const email of ['', 'bad', 'a@b.c', 'a b@example.com', '<a>@example.com', `${'a'.repeat(245)}@example.com`,
        'a..b@example.com', '.a@example.com', 'a.@example.com', 'a@ex..ample.com', 'a@.example.com',
        'a@example..com', 'a@-example.com', 'a@example-.com', 'a@exam_ple.com', 'a@@example.com', '@example.com', 'a@']) {
        assert.throws(() => validateRecipients([email]), /valid recipient/);
    }
    assert.throws(() => validateRecipients([], { required: true }), /at least one/);
    assert.throws(() => validateRecipients(['a@example.com', 'A@example.com']), /Duplicate/);
    const five = Array.from({ length: 5 }, (_, i) => `a${i}@example.com`);
    assert.equal(validateRecipients(five).length, 5);
    assert.throws(() => validateRecipients([...five, 'six@example.com']), { message: RECIPIENT_LIMIT_MESSAGE });
});

const recipients = ['a@example.com', 'b@example.com', 'c@example.com'];
test('delivery full success and legacy single-recipient success', () => {
    const full = getShareDeliveryResult({ ok: true, status: 201 }, {
        success: true, sentCount: 3, failedCount: 0, results: recipients.map(email => ({ email, status: 'sent' }))
    }, recipients);
    assert.equal(full.success, true);
    assert.equal(full.message, 'Map shared successfully with 3 recipients.');
    assert.deepEqual(full.delivered, recipients);
    assert.equal(getShareDeliveryResult({ ok: true, status: 201 }, { success: true }, recipients.slice(0, 1)).success, true);
    assert.equal(getShareDeliveryResult({ ok: true, status: 201 }, { success: true }, recipients).success, false);
});

test('207 preserves failures and reports only confirmed successful recipients', () => {
    const partial = getShareDeliveryResult({ ok: true, status: 207 }, {
        success: false, partial: true, sentCount: 2, failedCount: 1,
        results: recipients.map((email, i) => ({ email, status: i < 2 ? 'sent' : 'failed' }))
    }, recipients);
    assert.equal(partial.success, false);
    assert.deepEqual(partial.delivered, recipients.slice(0, 2));
    assert.equal(partial.message, 'Map shared with 2 of 3 recipients. Failed: c@example.com.');
});

test('failure and malformed responses never claim success or expose server URLs', () => {
    for (const [response, result] of [
        [{ ok: false, status: 500 }, { error: { message: 'secret https://maps.test/share/token' } }],
        [{ ok: true, status: 207 }, { success: true }],
        [{ ok: true, status: 201 }, null],
        [{ ok: true, status: 201 }, { success: true, results: [{ email: 'outsider@example.com', status: 'sent' }] }]
    ]) {
        const outcome = getShareDeliveryResult(response, result, recipients);
        assert.equal(outcome.success, false);
        assert.deepEqual(outcome.delivered, []);
        assert.equal(outcome.message, 'Unable to share the map. Please try again.');
    }
});
