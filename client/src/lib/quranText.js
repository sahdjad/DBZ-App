// Gemeinsame, kleine Textwerkzeuge für den Qur'an-Bereich. Ändert niemals den
// religiösen Inhalt selbst – nur rein visuelle Darstellungsartefakte.

// Entfernt NUR die „Null"-Zeichen für stumme Buchstaben (U+06DF/U+06E0), die
// in der Mushaf-Schrift als große gefüllte Punkte erscheinen. Buchstaben,
// Vokalzeichen, Sukun und Ayah-Zeichen bleiben unangetastet.
export const cleanQuran = (s) => (s || '').replace(/[۟۠]/g, '');

// Arabisch-indische Ziffern für Ayah-Endmarken (﴿١﴾ statt ﴿1﴾).
export const toArabicNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
