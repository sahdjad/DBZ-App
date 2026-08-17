import { api } from './api.js';

// Zielseite je Benachrichtigungstyp (Fallback, falls kein deepLink gesetzt ist).
const ROUTE_BY_TYPE = {
  absence_pending: '/entschuldigungen',
  absence_decided: '/abwesenheit',
  announcement: '/ankuendigungen',
  assignment_new: '/aufgaben',
  behavior_new: '/verhalten',
  exam_published: '/pruefungen',
  exam_result: '/pruefungen',
  exam_submitted: '/pruefungen',
  extension_granted: '/aufgaben',
  hifz_attempt: '/hifz',
  hifz_goal: '/hifz',
  message: '/nachrichten',
  protocol_submitted: '/protokolle',
  report_released: '/berichte',
  review_released: '/aufgaben',
  submission_new: '/korrektur',
};

export function notificationTarget(n) {
  return n.deepLink || ROUTE_BY_TYPE[n.type] || '/benachrichtigungen';
}

// Andere Komponenten (z. B. der Badge-Zähler in AppLayout) horchen darauf.
export function notifyBadgeRefresh() {
  window.dispatchEvent(new Event('dbz:notifications'));
}

// Beim Anklicken: als gelesen markieren, Badge aktualisieren, zur Quelle springen.
export async function openNotification(n, navigate) {
  try {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`);
      notifyBadgeRefresh();
    }
  } catch {
    /* Markieren ist unkritisch – trotzdem navigieren. */
  }
  navigate(notificationTarget(n));
}
