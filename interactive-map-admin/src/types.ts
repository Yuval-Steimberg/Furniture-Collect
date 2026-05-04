export interface Place {
  id: number
  name: string
  sub: string
  cat: string
  lat: number
  lng: number
  desc: string
  hours: string | null
  contact: string | null
  address: string
}

export const CATS: Record<string, { label: string; icon: string; color: string }> = {
  anchor:    { label: 'Just a Second', icon: '📍', color: '#3D5443' },
  cafe:      { label: 'קפה ואוכל',     icon: '☕',  color: '#B8762A' },
  photo:     { label: 'צילום',          icon: '📷',  color: '#3A6E8F' },
  art:       { label: 'אמנות',          icon: '🎨',  color: '#7B4F9E' },
  design:    { label: 'עיצוב ויצירה',   icon: '🏺',  color: '#3E7A4A' },
  events:    { label: 'מרחבים',         icon: '🏛️',  color: '#2D7A7E' },
  community: { label: 'קהילה',          icon: '🚲',  color: '#8A7A25' },
}

export const INITIAL_PLACES: Place[] = [
  { id: 1,  name: 'Just A Second',     sub: 'המרחב שלנו',                  cat: 'anchor',    lat: 32.0620681, lng: 34.7780304, desc: 'מתחם שימוש חוזר ומיחדוש, יוצרים מהשפע הקיים. הנקודה המרכזית של JAS Route — כל המקומות סביבנו!',              hours: null,                    contact: null,                       address: 'בגין 34, תל אביב'   },
  { id: 2,  name: 'Studio Oh',         sub: 'סטודיו לתכשיטים ובגדים',      cat: 'design',    lat: 32.0625157, lng: 34.7785068, desc: 'סטודיו לעיצוב תכשיטים ייחודיים בלב השכונה. הגעה בתיאום מראש.',                                             hours: 'א׳–ש׳ | בתיאום מראש',   contact: 'rinatcr@gmail.com',        address: 'נווה שאנן, ת״א'     },
  { id: 3,  name: 'סטודיו גברא',       sub: 'בית ספר לצילום',              cat: 'photo',     lat: 32.0616858, lng: 34.7778324, desc: 'בית הספר הותיק לצילום בישראל — כ-60 שנה. קואופרטיב הצילום הראשון בישראל, עם חדר חושך וגלריה שיתופית.',   hours: 'א׳–ש׳ | בתיאום מראש',   contact: null,                       address: 'נווה שאנן, ת״א'     },
  { id: 4,  name: 'דפנה לוי',          sub: 'סטודיו לציור',                cat: 'art',       lat: 32.0617189, lng: 34.7789975, desc: 'סדנאות ציור חווייתיות לכל הרמות, ללא צורך בניסיון קודם.',                                                  hours: 'א׳–ש׳ | בתיאום מראש',   contact: '054-808-9921',             address: 'נווה שאנן, ת״א'     },
  { id: 5,  name: 'פנימית',            sub: 'סדנת אופניים שיתופית',        cat: 'community', lat: 32.0584161, lng: 34.7623519, desc: 'סדנת אופניים שיתופית — תקנו, השמישו ורכבו עם תמיכת הקהילה.',                                               hours: 'א׳, ב׳, ה׳',            contact: null,                       address: 'תל אביב'            },
  { id: 6,  name: 'סטודיו טל הראל',    sub: 'אמנות ועיצוב תעשייתי',       cat: 'art',       lat: 32.06183,   lng: 34.77875,   desc: 'אמן ומעצב תעשייתי העוסק ב-ready-made, פיסול וקיימות.',                                                      hours: 'א׳–ש׳ | בתיאום מראש',   contact: '054-488-2704',             address: 'נווה שאנן, ת״א'     },
  { id: 7,  name: '1of Studio',        sub: 'עיצוב רהיטים בשימוש חוזר',   cat: 'design',    lat: 32.06215,   lng: 34.77820,   desc: 'סטודיו לעיצוב ובנייה של רהיטים מחומרים בשימוש חוזר. כל פריט הוא יחיד.',                                    hours: 'א׳–ו׳ | בתיאום מראש',   contact: '050-689-9101',             address: 'נווה שאנן, ת״א'     },
  { id: 8,  name: 'שחור לבן',          sub: 'סטודיו צילום וחדר חושך',      cat: 'photo',     lat: 32.06136,   lng: 34.77803,   desc: 'סטודיו צילום מקצועי, סדנאות וחדר חושך לחובבי הצילום האנלוגי.',                                             hours: 'א׳–ו׳ | בתיאום מראש',   contact: '054-303-3704',             address: 'נווה שאנן, ת״א'     },
  { id: 9,  name: 'תמוז Tamuz',        sub: 'חנות משק מבשלת',              cat: 'cafe',      lat: 32.0673282, lng: 34.7724947, desc: 'חנות משק מבשלת בלב העיר — מוצרים מקומיים ואיכותיים.',                                                       hours: 'א׳–ש׳',                 contact: null,                       address: 'לבונטין, ת״א'       },
  { id: 10, name: 'Cafe Zohar',        sub: 'קפה שכונתי',                  cat: 'cafe',      lat: 32.0599296, lng: 34.7807971, desc: 'בית קפה שכונתי בנווה שאנן — קטן, טעים ובוטיקי.',                                                          hours: null,                    contact: null,                       address: 'נווה שאנן, ת״א'     },
  { id: 11, name: 'גלריה נעם',         sub: 'גלריה לאמנות עכשווית',        cat: 'art',       lat: 32.06143,   lng: 34.77810,   desc: 'גלריה לאמנות עכשווית עם ליווי אצרותי מקצועי, הפקת תערוכות וסטודיו.',                                        hours: 'א׳–ו׳ | בתיאום מראש',   contact: null,                       address: 'נווה שאנן, ת״א'     },
  { id: 12, name: 'סטודיו דקלה יובל',  sub: 'אמנות ומיינדפולנס',           cat: 'art',       lat: 32.06195,   lng: 34.77885,   desc: 'סדנאות יצירה בשילוב תרגול מיינדפולנס — לאישי, זוגות וקבוצות.',                                             hours: 'א׳, ג׳–ו׳ | בתיאום מראש', contact: '050-350-6099',           address: 'נווה שאנן, ת״א'     },
  { id: 13, name: 'אברהם הוסטל',       sub: 'Abraham Hostel Tel Aviv',     cat: 'events',    lat: 32.0632912, lng: 34.7762937, desc: 'לאונג׳ ענק, גג ירוק עם בר שכונתי, חדר כושר, סטודיו ריקוד ואמבטיות קרח.',                                  hours: 'א׳–ש׳ | פתוח תמיד',     contact: null,                       address: 'לבונטין 21, ת״א'    },
  { id: 14, name: 'סטודיו סמואל',      sub: 'עיצוב קרמיקה תלת-מימדי',     cat: 'design',    lat: 32.0616784, lng: 34.7785752, desc: 'עיצוב קרמיקה בהדפסה תלת-מימדית + סדנאות מקצועיות לכל הרמות.',                                             hours: 'א׳–ב׳, ג׳, ה׳, ש׳ | בתיאום', contact: '050-316-1527',        address: 'נווה שאנן, ת״א'     },
  { id: 15, name: 'שה שנטל',           sub: 'Café Chantal',                cat: 'cafe',      lat: 32.0626756, lng: 34.7756166, desc: 'פריז בתל אביב — מאפים טריים, כריכים ואווירה צרפתית רכה.',                                                  hours: 'א׳–ו׳',                 contact: 'Chantal.sherez@gmail.com', address: 'לבונטין, ת״א'       },
  { id: 16, name: "צ'לסי יד שניה",    sub: 'חנות בגדי יד שניה וווינטג׳',  cat: 'design',    lat: 32.0604,    lng: 34.7758,    desc: "חנות בגדי יד שניה וווינטג׳ — יכולה לארח מעל 20 איש בו זמנית.",                                               hours: 'א׳–ו׳',                 contact: 'מיכל | 050-282-0822',      address: "מקווה ישראל 22, ת״א" },
  { id: 17, name: 'המגדלור ספרים',    sub: 'חנות ספרים ומתנות עצמאית',    cat: 'art',       lat: 32.0606,    lng: 34.7757,    desc: 'חנות ספרים ומתנות עצמאית בתל אביב — אמנות ויצירה, ספרים, מתנות. קבוצות עד 10 איש, נא לתאם מראש דרך המייל.', hours: 'א׳–ו׳',                 contact: '052-883-5122 | info@hamigdalor.co.il', address: 'מקווה ישראל 18, ת״א' },
]
