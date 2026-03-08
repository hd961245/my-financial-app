import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const getQuote = async (symbol: string) => {
  try {
    const result = await yahooFinance.quote(symbol);
    return result;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
};

export const getHistorical = async (symbol: string, period1: string, period2?: string) => {
  try {
    const queryOptions: any = { period1 };
    if (period2) queryOptions.period2 = period2;

    const result = await yahooFinance.historical(symbol, queryOptions);
    return result;
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return null;
  }
};

export const searchSymbols = async (query: string) => {
  try {
    const result = await yahooFinance.search(query);
    return result;
  } catch (error) {
    console.error(`Error searching quotes for ${query}:`, error);
    return null;
  }
};
