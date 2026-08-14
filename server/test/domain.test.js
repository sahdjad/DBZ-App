// Unit-Tests der reinen Domänenlogik (Verspätung + QR-Token).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStatusFor, issueQrToken, verifyQrToken } from '../domain.js';

test('pünktlich innerhalb der Toleranz => present', () => {
  const r = attendanceStatusFor({
    checkInAt: '2026-08-01T14:04:00.000Z',
    scheduledStart: '2026-08-01T14:00:00.000Z',
    lateAfterMinutes: 5,
  });
  assert.equal(r.status, 'present');
  assert.equal(r.minutesLate, 4);
});

test('über der Toleranz => late mit korrekten Minuten', () => {
  const r = attendanceStatusFor({
    checkInAt: '2026-08-01T14:12:00.000Z',
    scheduledStart: '2026-08-01T14:00:00.000Z',
    lateAfterMinutes: 5,
  });
  assert.equal(r.status, 'late');
  assert.equal(r.minutesLate, 12);
});

test('vor Beginn => keine negative Verspätung', () => {
  const r = attendanceStatusFor({
    checkInAt: '2026-08-01T13:55:00.000Z',
    scheduledStart: '2026-08-01T14:00:00.000Z',
    lateAfterMinutes: 5,
  });
  assert.equal(r.status, 'present');
  assert.equal(r.minutesLate, 0);
});

test('QR-Token: gültiger Token wird akzeptiert', () => {
  const session = {};
  const token = issueQrToken(session, 300);
  assert.ok(session.qr.tokenHash);
  assert.equal(verifyQrToken(session, token).ok, true);
});

test('QR-Token: falscher Token wird abgelehnt', () => {
  const session = {};
  issueQrToken(session, 300);
  assert.equal(verifyQrToken(session, 'falsch').ok, false);
});

test('QR-Token: abgelaufener Token wird abgelehnt', () => {
  const session = {};
  const token = issueQrToken(session, -1); // sofort abgelaufen
  assert.equal(verifyQrToken(session, token).ok, false);
});
