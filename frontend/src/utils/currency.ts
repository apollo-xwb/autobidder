// Currency symbol mapping
export const getCurrencySymbol = (currencyCode?: string | null): string => {
  if (!currencyCode) return '$'
  
  const symbols: { [key: string]: string } = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'CNY': '¥',
    'AUD': 'A$',
    'CAD': 'C$',
    'CHF': 'CHF ',
    'MXN': 'MX$',
    'BRL': 'R$',
    'ZAR': 'R',
    'SGD': 'S$',
    'HKD': 'HK$',
    'NZD': 'NZ$',
    'SEK': 'kr',
    'NOK': 'kr',
    'DKK': 'kr',
    'PLN': 'zł',
    'AED': 'د.إ',
    'SAR': '﷼',
    'THB': '฿',
    'IDR': 'Rp',
    'MYR': 'RM',
    'PHP': '₱',
    'VND': '₫',
    'KRW': '₩',
    'TRY': '₺',
    'ILS': '₪',
    'RUB': '₽',
  }
  
  return symbols[currencyCode.toUpperCase()] || currencyCode.toUpperCase() + ' '
}

export const formatCurrency = (amount: number, currencyCode?: string | null): string => {
  const symbol = getCurrencySymbol(currencyCode)
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}



