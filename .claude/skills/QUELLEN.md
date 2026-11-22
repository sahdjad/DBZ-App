# Skills für die iOS-/App-Store-Vorbereitung – Quellen und Lizenzen

Übernommen am 22.11.2026 auf Wunsch des Betreibers, vorher durchgesehen: nur Text (Markdown/JSON), keine Skripte,
keine versteckten Anweisungen. Bewusst nur die Skills, die für die DBZ-App auf dem Weg in den App Store zählen
(Stufe 7 in `docs/ROADMAP.md`); weitere aus denselben Paketen lassen sich bei Bedarf nachholen.

| Skill | Quelle (Stand) | Lizenz |
|---|---|---|
| `hig` (Human Interface Guidelines zum Nachschlagen) | github.com/Prisma-Labs-Dev/apple-skills (4986260) | MIT, siehe `hig/LICENSE` |
| `mobile-native`, `apple-design`, `break-ui`, `emil-design-eng`, `review-animations`, `remove-animations`, `animation-performance`, `choreograph` (Web-App wie eine native App, Bewegung, Belastungstest der Oberfläche) | github.com/emilkowalski/skills (64eb3de) | MIT, siehe jeweilige `LICENSE` |
| `app-store-review`, `app-store-optimization`, `ios-accessibility`, `swiftui-webkit`, `push-notifications`, `authentication`, `passkit`, `ios-localization`, `swift-security` | github.com/dpearson2699/swift-ios-skills (8d90fd1) | PolyForm Perimeter 1.0.0, siehe jeweilige `LICENSE` (Nutzung erlaubt, kein Konkurrenzprodukt zu den Skills) |

Nicht übernommen aus emilkowalski/skills: React-Native/Expo, Swift-Schreibstil, Sonner, Bibliothekswahl, Prototypen,
Geschmacks-Regeln, Glossar – passen nicht zur DBZ-App oder würden neue Bibliotheken nahelegen.
`break-ui`: Der Schalter für Extremdaten bleibt nur in der Entwicklung, nie in Produktion, und nutzt nur erfundene Testdaten.

Hinweis: Die Skills sind Anweisungen für Claude. Bei Aktualisierung erneut durchsehen, bevor sie übernommen werden.
