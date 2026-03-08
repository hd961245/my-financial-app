const url = "https://docs.google.com/spreadsheets/d/14FbY7EAiGL3uEOrzPFLBmV9cQLb07nmAw_A2LjiPmpQ/export?format=csv&gid=0";
fetch(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
}).then(r => {
    console.log("STATUS:", r.status);
    return r.text();
}).then(text => {
    console.log("TEXT LENGTH:", text.length);
    console.log("TEXT START:", text.substring(0, 100));
}).catch(console.error);
