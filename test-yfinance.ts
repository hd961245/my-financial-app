import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function main() {
    try {
        const period1 = new Date();
        period1.setDate(period1.getDate() - 150);

        console.log("Testing historical data fetch for AAPL...");
        const result = await yahooFinance.historical("AAPL", {
            period1: period1.toISOString().split('T')[0],
            period2: new Date().toISOString().split('T')[0],
            interval: "1d"
        });

        console.log(`Success! Fetched ${result.length} historical records.`);
    } catch (e) {
        console.error("Failed:", e);
    }
}
main();
