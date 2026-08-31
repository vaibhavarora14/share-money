import { Currency } from "../types";

export type IsoCurrency = Currency & {
  decimals?: number;
};

/**
 * Circulating ISO 4217 currencies (excludes metals, funds, and obsolete codes).
 * Popular codes are listed first for the picker; the rest stay alphabetical by name.
 */
const POPULAR_CURRENCY_CODES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "KRW",
  "CNY",
  "AUD",
  "CAD",
  "THB",
  "SGD",
  "HKD",
  "AED",
  "CHF",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "MXN",
  "BRL",
  "ZAR",
  "IDR",
  "MYR",
  "PHP",
  "VND",
  "PKR",
  "BDT",
  "LKR",
  "NPR",
  "TWD",
  "ILS",
  "SAR",
  "EGP",
  "TRY",
  "PLN",
];
const POPULAR_CURRENCY_CODE_SET = new Set(POPULAR_CURRENCY_CODES);

const ISO_CURRENCIES: IsoCurrency[] = [
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "AFN", symbol: "؋", name: "Afghan Afghani" },
  { code: "ALL", symbol: "L", name: "Albanian Lek" },
  { code: "AMD", symbol: "֏", name: "Armenian Dram" },
  { code: "ANG", symbol: "ƒ", name: "Netherlands Antillean Guilder" },
  { code: "AOA", symbol: "Kz", name: "Angolan Kwanza" },
  { code: "ARS", symbol: "AR$", name: "Argentine Peso" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "AWG", symbol: "ƒ", name: "Aruban Florin" },
  { code: "AZN", symbol: "₼", name: "Azerbaijani Manat" },
  { code: "BAM", symbol: "KM", name: "Bosnia-Herzegovina Convertible Mark" },
  { code: "BBD", symbol: "Bds$", name: "Barbadian Dollar" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev" },
  { code: "BHD", symbol: "BD", name: "Bahraini Dinar" },
  { code: "BIF", symbol: "FBu", name: "Burundian Franc", decimals: 0 },
  { code: "BMD", symbol: "BD$", name: "Bermudian Dollar" },
  { code: "BND", symbol: "B$", name: "Brunei Dollar" },
  { code: "BOB", symbol: "Bs", name: "Bolivian Boliviano" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "BSD", symbol: "B$", name: "Bahamian Dollar" },
  { code: "BTN", symbol: "Nu", name: "Bhutanese Ngultrum" },
  { code: "BWP", symbol: "P", name: "Botswana Pula" },
  { code: "BYN", symbol: "Br", name: "Belarusian Ruble" },
  { code: "BZD", symbol: "BZ$", name: "Belize Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CDF", symbol: "FC", name: "Congolese Franc" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CLP", symbol: "CL$", name: "Chilean Peso", decimals: 0 },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "COP", symbol: "CO$", name: "Colombian Peso" },
  { code: "CRC", symbol: "₡", name: "Costa Rican Colón" },
  { code: "CUP", symbol: "CU$", name: "Cuban Peso" },
  { code: "CVE", symbol: "CVE", name: "Cape Verdean Escudo" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "DJF", symbol: "Fdj", name: "Djiboutian Franc", decimals: 0 },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "DOP", symbol: "RD$", name: "Dominican Peso" },
  { code: "DZD", symbol: "DA", name: "Algerian Dinar" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  { code: "ERN", symbol: "Nfk", name: "Eritrean Nakfa" },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "FJD", symbol: "FJ$", name: "Fijian Dollar" },
  { code: "FKP", symbol: "£", name: "Falkland Islands Pound" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "GEL", symbol: "₾", name: "Georgian Lari" },
  { code: "GHS", symbol: "₵", name: "Ghanaian Cedi" },
  { code: "GIP", symbol: "£", name: "Gibraltar Pound" },
  { code: "GMD", symbol: "D", name: "Gambian Dalasi" },
  { code: "GNF", symbol: "FG", name: "Guinean Franc", decimals: 0 },
  { code: "GTQ", symbol: "Q", name: "Guatemalan Quetzal" },
  { code: "GYD", symbol: "G$", name: "Guyanese Dollar" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "HNL", symbol: "L", name: "Honduran Lempira" },
  { code: "HTG", symbol: "G", name: "Haitian Gourde" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "ILS", symbol: "₪", name: "Israeli New Shekel" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "IQD", symbol: "IQD", name: "Iraqi Dinar" },
  { code: "IRR", symbol: "IRR", name: "Iranian Rial" },
  { code: "ISK", symbol: "kr", name: "Icelandic Króna", decimals: 0 },
  { code: "JMD", symbol: "J$", name: "Jamaican Dollar" },
  { code: "JOD", symbol: "JD", name: "Jordanian Dinar" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", decimals: 0 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "KGS", symbol: "сом", name: "Kyrgyzstani Som" },
  { code: "KHR", symbol: "៛", name: "Cambodian Riel" },
  { code: "KMF", symbol: "CF", name: "Comorian Franc", decimals: 0 },
  { code: "KRW", symbol: "₩", name: "South Korean Won", decimals: 0 },
  { code: "KWD", symbol: "KD", name: "Kuwaiti Dinar" },
  { code: "KYD", symbol: "CI$", name: "Cayman Islands Dollar" },
  { code: "KZT", symbol: "₸", name: "Kazakhstani Tenge" },
  { code: "LAK", symbol: "₭", name: "Lao Kip" },
  { code: "LBP", symbol: "LBP", name: "Lebanese Pound" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee" },
  { code: "LRD", symbol: "L$", name: "Liberian Dollar" },
  { code: "LSL", symbol: "L", name: "Lesotho Loti" },
  { code: "LYD", symbol: "LD", name: "Libyan Dinar" },
  { code: "MAD", symbol: "DH", name: "Moroccan Dirham" },
  { code: "MDL", symbol: "L", name: "Moldovan Leu" },
  { code: "MGA", symbol: "Ar", name: "Malagasy Ariary" },
  { code: "MKD", symbol: "ден", name: "Macedonian Denar" },
  { code: "MMK", symbol: "K", name: "Myanmar Kyat" },
  { code: "MNT", symbol: "₮", name: "Mongolian Tögrög" },
  { code: "MOP", symbol: "MOP$", name: "Macanese Pataca" },
  { code: "MRU", symbol: "UM", name: "Mauritanian Ouguiya" },
  { code: "MUR", symbol: "₨", name: "Mauritian Rupee" },
  { code: "MVR", symbol: "Rf", name: "Maldivian Rufiyaa" },
  { code: "MWK", symbol: "MK", name: "Malawian Kwacha" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "MZN", symbol: "MT", name: "Mozambican Metical" },
  { code: "NAD", symbol: "N$", name: "Namibian Dollar" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "NIO", symbol: "C$", name: "Nicaraguan Córdoba" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "NPR", symbol: "रू", name: "Nepalese Rupee" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "OMR", symbol: "OMR", name: "Omani Rial" },
  { code: "PAB", symbol: "B/.", name: "Panamanian Balboa" },
  { code: "PEN", symbol: "S/", name: "Peruvian Sol" },
  { code: "PGK", symbol: "K", name: "Papua New Guinean Kina" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "PLN", symbol: "zł", name: "Polish Złoty" },
  { code: "PYG", symbol: "₲", name: "Paraguayan Guaraní", decimals: 0 },
  { code: "QAR", symbol: "QAR", name: "Qatari Riyal" },
  { code: "RON", symbol: "lei", name: "Romanian Leu" },
  { code: "RSD", symbol: "din", name: "Serbian Dinar" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "RWF", symbol: "FRw", name: "Rwandan Franc", decimals: 0 },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  { code: "SBD", symbol: "SI$", name: "Solomon Islands Dollar" },
  { code: "SCR", symbol: "₨", name: "Seychellois Rupee" },
  { code: "SDG", symbol: "SDG", name: "Sudanese Pound" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "SHP", symbol: "£", name: "Saint Helena Pound" },
  { code: "SLE", symbol: "Le", name: "Sierra Leonean Leone" },
  { code: "SOS", symbol: "Sh", name: "Somali Shilling" },
  { code: "SRD", symbol: "Sr$", name: "Surinamese Dollar" },
  { code: "SSP", symbol: "£", name: "South Sudanese Pound" },
  { code: "STN", symbol: "Db", name: "São Tomé and Príncipe Dobra" },
  { code: "SYP", symbol: "£", name: "Syrian Pound" },
  { code: "SZL", symbol: "L", name: "Swazi Lilangeni" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "TJS", symbol: "SM", name: "Tajikistani Somoni" },
  { code: "TMT", symbol: "m", name: "Turkmenistani Manat" },
  { code: "TND", symbol: "DT", name: "Tunisian Dinar" },
  { code: "TOP", symbol: "T$", name: "Tongan Paʻanga" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "TTD", symbol: "TT$", name: "Trinidad and Tobago Dollar" },
  { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia" },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling", decimals: 0 },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "UYU", symbol: "$U", name: "Uruguayan Peso" },
  { code: "UZS", symbol: "so'm", name: "Uzbekistani Som" },
  { code: "VES", symbol: "Bs", name: "Venezuelan Bolívar" },
  { code: "VND", symbol: "₫", name: "Vietnamese Đồng", decimals: 0 },
  { code: "VUV", symbol: "VT", name: "Vanuatu Vatu", decimals: 0 },
  { code: "WST", symbol: "T", name: "Samoan Tala" },
  { code: "XAF", symbol: "FCFA", name: "Central African CFA Franc", decimals: 0 },
  { code: "XCD", symbol: "EC$", name: "East Caribbean Dollar" },
  { code: "XOF", symbol: "CFA", name: "West African CFA Franc", decimals: 0 },
  { code: "XPF", symbol: "₣", name: "CFP Franc", decimals: 0 },
  { code: "YER", symbol: "YER", name: "Yemeni Rial" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "ZMW", symbol: "ZK", name: "Zambian Kwacha" },
  { code: "ZWG", symbol: "ZiG", name: "Zimbabwe Gold" },
];

const currencyByCode = new Map(ISO_CURRENCIES.map((currency) => [currency.code, currency]));

function compareCurrencyName(a: IsoCurrency, b: IsoCurrency): number {
  return a.name.localeCompare(b.name);
}

export const CURRENCIES: Currency[] = [
  ...POPULAR_CURRENCY_CODES
    .map((code) => currencyByCode.get(code))
    .filter((currency): currency is IsoCurrency => !!currency),
  ...ISO_CURRENCIES
    .filter((currency) => !POPULAR_CURRENCY_CODE_SET.has(currency.code))
    .sort(compareCurrencyName),
];

export const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  ISO_CURRENCIES.map((currency) => [currency.code, currency.symbol])
);

export const ZERO_DECIMAL_CURRENCIES = new Set(
  ISO_CURRENCIES.filter((currency) => currency.decimals === 0).map((currency) => currency.code)
);

export function getIsoCurrency(code: string): IsoCurrency | undefined {
  return currencyByCode.get(code.toUpperCase());
}

export function filterCurrencies(query: string, currencies: Currency[] = CURRENCIES): Currency[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return currencies;
  return currencies.filter((currency) =>
    currency.code.toLowerCase().includes(normalized) ||
    currency.name.toLowerCase().includes(normalized) ||
    currency.symbol.toLowerCase().includes(normalized)
  );
}
