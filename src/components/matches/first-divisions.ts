/**
 * The top division of every country (no cups, women's, youth, reserves or lower divisions).
 * The catalogue lists some leagues twice (a short id like ENG1 and a Stake id like STK-england-premier-league); both are here.
 * Ids that are not in the current catalogue are simply ignored by the picker.
 */
export const FIRST_DIVISION_IDS: ReadonlySet<string> = new Set([
  // Europe
  'ENG1', 'STK-england-premier-league', 'ESP1', 'STK-spain-la-liga', 'GER1', 'STK-germany-bundesliga', 'ITA1', 'STK-italy-serie-a',
  'FRA1', 'STK-france-ligue-1', 'NED1', 'STK-netherlands-eredivisie', 'POR1', 'BEL1', 'TUR1', 'SCO1', 'GRE1', 'AUT1', 'SUI1', 'DEN1', 'NOR1', 'SWE1',
  'CZE1', 'ROU1', 'STK-romania-liga-i', 'RUS1', 'STK-ukraine-premier-league', 'STK-poland-ekstraklasa', 'STK-croatia-1-hnl', 'STK-serbia-superliga',
  'STK-hungary-nb-i', 'STK-bulgaria-first-professional-league', 'CYP1', 'STK-cyprus-1st-division', 'IRL1', 'STK-ireland-premier-division',
  'NIR1', 'STK-northern-ireland-premiership', 'WAL1', 'STK-wales-cymru-premier', 'FIN1', 'STK-finland-veikkausliiga', 'STK-slovakia-superliga',
  'STK-slovenia-prvaliga', 'STK-bosnia-herzegovina-premijer-liga', 'STK-north-macedonia-1-mfl', 'STK-georgia-erovnuli-liga', 'STK-armenia-premier-league',
  'STK-azerbaijan-premier-league', 'STK-belarus-vysshaya-liga', 'STK-estonia-premium-liiga', 'STK-latvia-virsliga', 'STK-lithuania-a-lyga',
  'STK-luxembourg-division-nationale', 'STK-malta-premier-league', 'STK-andorra-primera-divisio', 'STK-san-marino-campionato-sammarinese', 'ISR1',
  // Americas
  'ARG1', 'BRA1', 'CHI1', 'COL1', 'URU1', 'STK-uruguay-primera-division', 'PAR1', 'ECU1', 'PER1', 'STK-peru-primera-division',
  'STK-bolivia-division-profesional', 'STK-venezuela-primera-division', 'MEX1', 'STK-mexico-liga-mx', 'USA1', 'STK-canada-canadian-premier-league',
  'STK-costa-rica-primera-division-apertura', 'STK-guatemala-liga-nacional-apertura', 'STK-honduras-liga-nacional-apertura',
  'STK-el-salvador-primera-division-apertura', 'STK-nicaragua-primera-division', 'STK-panama-liga-panamena-de-futbol-apertura', 'STK-puerto-rico-lpr-pro',
  // Asia and Oceania
  'JPN1', 'STK-republic-of-korea-k-league-1', 'CHN1', 'AUS1', 'KSA1', 'STK-qatar-stars-league', 'STK-united-arab-emirates-arabian-gulf-league',
  'STK-iran-pro-league', 'STK-iraq-iraqi-league', 'THA1', 'STK-thailand-thai-league-1', 'IDN1', 'STK-indonesia-indonesian-super-league',
  'STK-vietnam-v-league', 'IND1', 'STK-new-zealand-premiership', 'STK-hong-kong-china-premier-league', 'STK-singapore-premier-league',
  'STK-philippines-philippines-footb-league', 'STK-cambodia-cambodian-premier-league', 'STK-myanmar-national-league', 'STK-oman-omani-league',
  'STK-bahrain-premier-league', 'STK-kuwait-kuwait-league', 'STK-jordan-jordan-league', 'STK-lebanon-premier-league', 'STK-syrian-arab-republic-syrian-league',
  'STK-uzbekistan-pfl',
  // Africa
  'RSA1', 'STK-egypt-premier-league', 'STK-morocco-botola', 'STK-tunisia-ligue-1', 'STK-algeria-ligue-1', 'STK-nigeria-professional-league',
  'STK-kenya-premier-league', 'STK-tanzania-premier-league', 'STK-ethiopia-premier-league', 'STK-rwanda-rwanda-premier-league',
  'STK-senegal-premier-league', 'STK-mali-ligue-1', 'STK-ivory-coast-ligue-1', 'STK-angola-girabola', 'STK-botswana-premier-league',
]);
