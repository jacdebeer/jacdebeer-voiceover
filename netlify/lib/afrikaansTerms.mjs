// Standard Afrikaans accounting terminology, kept on the server so every Afrikaans job uses the same words.
//
// Sources (both supplied by the owner):
//  1. Raad op Rekeningkundige Standaarde, "Glossarium van Omskrewe Terme" (April 2014): the AF_STANDARD_TERMS list.
//  2. N. Stegmann, review of "Juta's Concise Dictionary of Accounting Terms with their Afrikaans Equivalents",
//     Lexikos 10 (2000): the EN_AF_PAIRS list. The review itself says many terms in the dictionary are dated, so
//     where it names a replacement, the replacement is listed here.
//
// Precedence: HOUSE TERMS in lessonPrompt.mjs win over everything here (they are the school-curriculum forms).
// Then the 2014 glossary, then the Juta review.

export const AF_STANDARD_TERMS = [
  'aanbiedingsgeldeenheid', 'aanvang van die huurtermyn', 'aanvanklike direkte koste', 'aanvanklike verkryging',
  'afgeleide instrument', 'afgeleide verpligting', 'afskryfbare bedrag', 'afsonderlike finansiële state',
  'agterstallig', 'aktiewe mark', 'aktuariële winste en verliese', 'amortisasie', 'ander prysrisiko',
  'bateklas (eiendom, aanleg en toerusting)', 'bates', 'bedryfsaktiwiteite', 'bedryfshuur', 'beduidende invloed',
  'begrotingsgrondslag', 'beheer', 'beheerde entiteit', 'beherende entiteit', 'belasbare gebeurtenis',
  'belastinguitgawes', 'belegger', 'beleggingsaktiwiteite', 'beleggingseiendom', 'bestuur', 'beswarende kontrak',
  'billike waarde', 'billike waarde minus koste om te verkoop', 'biologiese bate', 'boetes', 'buitelandse onderneming',
  'buitelandse valuta', 'bydraes van eienaars', 'diensbeëindigingsvoordele', 'drabedrag', 'ekonomiese entiteit',
  'ekonomiese nutsduur', 'ekwiteitsinstrument', 'ekwiteitsmetode', 'finansiële bate', 'finansiële instrument',
  'finansiële las', 'finansieringsaktiwiteite', 'foute in vorige tydperk', 'funksionele geldeenheid',
  'geamortiseerde koste', 'geassosieerde', 'gebeure ná die verslagdoeningsdatum', 'gesamentlike beheer',
  'gesamentlike onderneming', 'gestaakte bedrywigheid', 'goedgekeurde begroting', 'herstrukturering',
  'huidigedienskoste', 'huur', 'huurtermyn', 'identifiseerbare bate', 'inkomste', 'jaarlikse begroting',
  'kombinerende entiteite', 'kontant', 'kontantekwivalente', 'kontantgenererende bate', 'kontantgenererende eenheid',
  'kontantgrondslag', 'kontantvloei', 'kontrakteur', 'korttermynwerknemersvoordele', 'kosprysmetode',
  'koste om te verkoop', 'kredietrisiko', 'laste', 'lenings betaalbaar', 'likiditeitsrisiko', 'markrisiko',
  'minimum huurbetaling', 'monetêre items', 'na-aftreevoordele', 'navorsing', 'netto bates', 'niebeherende belang',
  'niekanselleerbare huur', 'niemonetêre items', 'nie-uitruiltransaksies', 'nominale rentekoers', 'nutsduur', 'oes',
  'omskrewebydraeplanne', 'omskrewevoordeelplanne', 'ondernemer', 'ontasbare bate', 'onterkenning', 'ontwikkeling',
  'onvervreembare item', 'oordragte', 'opbrengs op planbates', 'planbates', 'proporsionele konsolidasie',
  'rekeningkundige beleide', 'rekeningkundige grondslag', 'rentekoste', 'reswaarde', 'samesmelting', 'segment',
  'spesialedoel-entiteit', 'staatsakeonderneming', 'terugwerkende toepassing', 'toevallingsgrondslag',
  'transaksiekoste', 'uitgawes', 'uitkerings aan eienaars', 'uitruiltransaksies', 'valutarisiko',
  'verandering in rekeningkundige raming', 'verhaalbare bedrag', 'verkrygingsdatum', 'verkrygingskoste',
  'verpligtende gebeurtenis', 'vervreemdingskoste', 'verwante party', 'verslagdoeningsdatum', 'voorraad',
  'voorsiening', 'voorwaardelike aanspreeklikheid', 'voorwaardelike bate', 'voorwaardelike huur', 'vorigedienskoste',
  'waardedaling', 'werknemersvoordele', 'wesenlik', 'wetlike verpligting', 'wisselkoers', 'wisselkoersverskil',
];

// [English, Afrikaans]. Where the Juta review gives a preferred or replacement form, that form is used.
export const EN_AF_PAIRS = [
  ['accounting', 'rekeningkunde'], ['accounting assumptions', 'rekeningkundige veronderstellings'],
  ['accounting date', 'rekenpligtige datum'], ['accounting period', 'rekenpligtige tydperk'],
  ['accounting policies', 'rekeningkundige beleid'], ['accounting profit', 'rekeningkundige wins'],
  ['accrual (adjustment)', 'toevallingsaansuiwering'], ['ageing (debtors)', 'debiteure-ontleding'],
  ['allocate', 'toedeel'], ['amortisation', 'amortisasie'], ['annual report', 'jaarverslag'],
  ['assessed loss', 'aangeslane verlies'], ['associate', 'geassosieerde'], ['borrowing costs', 'leenkoste'],
  ['carrying amount', 'drabedrag'], ['cash', 'kontant'], ['cash equivalents', 'kontantekwivalente'],
  ['cash flow statement', 'kontantvloeistaat'], ['cash on delivery', 'kontant by aflewering (KBA)'],
  ['closing balance', 'eindsaldo'], ['contingent asset', 'voorwaardelike bate'],
  ['contingent liability', 'voorwaardelike aanspreeklikheid'], ['control', 'beheer'], ['cost', 'koste'],
  ['credit (verb)', 'krediteer'], ['crediting', 'kreditering'], ['current asset', 'bedryfsbate'],
  ['current liability', 'bedryfslas'], ['current ratio', 'bedryfskapitaalverhouding'], ['current tax', 'lopende belasting'],
  ['debit (verb)', 'debiteer'], ['debiting', 'debitering'], ['debtor', 'debiteur'],
  ['defined benefit plan', 'omskrewevoordeelplan'], ['defined contribution plan', 'omskrewebydraeplan'],
  ['deferred tax', 'uitgestelde belasting'], ['depreciable amount', 'afskryfbare bedrag'],
  ['depreciation', 'waardevermindering (ook depresiasie)'], ['directors\' report', 'direkteursverslag'],
  ['earnings per share', 'verdienste per aandeel'], ['equity', 'ekwiteit'], ['equity instrument', 'ekwiteitsinstrument'],
  ['excess of expenses over revenue', 'tekort'], ['expenditure', 'besteding'], ['fair value', 'billike waarde'],
  ['favourable balance', 'batige saldo'], ['financial asset', 'finansiële bate'],
  ['financial instrument', 'finansiële instrument'], ['financial liability', 'finansiële las'],
  ['financial statements', 'finansiële state'], ['financing activities', 'finansieringsaktiwiteite'],
  ['fixed asset', 'vaste bate (nou: niebedryfsbate)'], ['fixed overhead', 'vaste drakoste'],
  ['gearing', 'hefboomwerking'], ['holding company', 'houermaatskappy (nou: moedermaatskappy)'],
  ['impairment loss', 'waardedalingsverlies'], ['income statement', 'inkomstestaat'],
  ['inflation accounting', 'inflasie-rekeningkunde'], ['intangible asset', 'ontasbare bate'],
  ['interim period', 'tussentydperk'], ['investing activities', 'beleggingsaktiwiteite'],
  ['joint control', 'gesamentlike beheer'], ['joint venture', 'gesamentlike onderneming'], ['lease', 'huur'],
  ['liquidate', 'likwideer'], ['minority interest', 'minderheidsbelang (nou: niebeherende belang)'],
  ['monetary item', 'monetêre item'], ['net profit', 'netto wins'], ['net realisable value', 'netto realiseerbare waarde'],
  ['non-current asset', 'niebedryfsbate'], ['offset', 'verrekening'], ['onerous contract', 'beswarende kontrak'],
  ['ordinary shares', 'gewone aandele'], ['overhead costs', 'drakoste'], ['parent company', 'moedermaatskappy'],
  ['participating preference shares', 'deelnemende voorkeuraandele'], ['profit-sharing ratio', 'winsverdelingsverhouding'],
  ['provision', 'voorsiening'], ['recoverable amount', 'verhaalbare bedrag'],
  ['reducing balance method', 'verminderdesaldo-metode'], ['related parties', 'verwante partye'],
  ['reporting period', 'verslagdoeningstydperk'], ['reserve', 'reserwe'], ['residual value', 'reswaarde'],
  ['restructuring', 'herstrukturering'], ['revenue', 'inkomste'], ['rights issue', 'regte-uitgifte'],
  ['subsidiary ledger', 'hulpgrootboek'], ['subsidiary books', 'hulpboeke'], ['tax base', 'belastingbasis'],
  ['taxable profit/loss', 'belasbare wins/verlies'], ['temporary differences', 'tydelike verskille'],
  ['trade mark', 'handelsmerk'], ['useful life', 'nutsduur'], ['value in use', 'gebruikswaarde'],
  ['work in progress', 'onvoltooide werk (ook werk-in-proses)'],
];

// Dutch forms that must never appear in Afrikaans text, with the Afrikaans form to use.
export const NOT_DUTCH = [
  ['niet', 'nie'], ['ik', 'ek'], ['wij / we', 'ons'], ['zijn / hebben', 'is / het'], ['een (lidwoord)', '’n'],
  ['de / het (lidwoord)', 'die'], ['uitgave (kosten)', 'uitgawe'], ['kosten', 'koste'], ['winst', 'wins'],
  ['inkomsten', 'inkomste'], ['betrokken', 'betrokke'], ['bedrijf', 'onderneming of besigheid'],
  ['boekhouding', 'rekeningkunde'], ['factuur', 'faktuur'], ['afschrijving', 'waardevermindering'],
  ['schuld', 'skuld'], ['rekeningen', 'rekeninge'], ['omzet', 'omset'],
];

export function afrikaansGlossaryPrompt() {
  return [
    'AFRIKAANS ONLY. Write South African Afrikaans (af-ZA) and nothing else. Never Dutch, never a Dutch-sounding spelling or word order, never an English word where an Afrikaans term exists.',
    'Dutch forms to avoid, with the Afrikaans form to use: ' + NOT_DUTCH.map(([d, a]) => d + ' -> ' + a).join('; ') + '.',
    '',
    'STANDARD AFRIKAANS ACCOUNTING TERMS. Use these exact forms whenever the concept occurs. HOUSE TERMS above override this list where they differ.',
    'English -> Afrikaans: ' + EN_AF_PAIRS.map(([e, a]) => e + ' = ' + a).join('; ') + '.',
    'Standard defined terms (Raad op Rekeningkundige Standaarde glossary, 2014): ' + AF_STANDARD_TERMS.join('; ') + '.',
  ].join('\n');
}
