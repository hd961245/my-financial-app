import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CapitalFlowTracker() {
    const sectors = [
        { name: "Semiconductors (半導體)", change: 2.4, size: "col-span-2 row-span-2", color: "bg-green-500/20" },
        { name: "Finance (金融)", change: 0.8, size: "col-span-1 row-span-1", color: "bg-green-500/10" },
        { name: "Shipping (航運)", change: -1.2, size: "col-span-1 row-span-1", color: "bg-red-500/20" },
        { name: "Biotech (生技)", change: -3.5, size: "col-span-2 row-span-1", color: "bg-red-500/30" },
        { name: "AI Concepts (AI概念股)", change: 4.1, size: "col-span-2 row-span-2", color: "bg-green-500/30" },
        { name: "Energy (綠能)", change: 1.1, size: "col-span-2 row-span-1", color: "bg-green-500/10" },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="col-span-2">
                <CardHeader>
                    <CardTitle>Sector Heatmap (資金動向熱力圖)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-4 grid-rows-3 gap-2 h-[300px]">
                        {sectors.map((sector) => (
                            <div
                                key={sector.name}
                                className={`${sector.size} ${sector.color} border rounded-md p-4 flex flex-col justify-center items-center transition-colors hover:brightness-110`}
                            >
                                <span className="font-bold text-center text-sm">{sector.name}</span>
                                <span className={`text-xs mt-1 ${sector.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {sector.change >= 0 ? '+' : ''}{sector.change}%
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>重點觀察板塊 (Highlight Concepts)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <p className="text-sm font-medium">法人連續買超 (Net Institutional Buying)</p>
                        <p className="text-xs text-muted-foreground mb-2">外資 / 投信 (Foreign / IT)</p>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center bg-muted p-2 rounded">
                                <span className="font-bold text-sm">2330.TW (台積電 TSMC)</span>
                                <span className="text-green-500 text-xs">+12,450 張</span>
                            </div>
                            <div className="flex justify-between items-center bg-muted p-2 rounded">
                                <span className="font-bold text-sm">NVDA (輝達 NVIDIA)</span>
                                <span className="text-green-500 text-xs">+1.2M Vol</span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t">
                        <p className="text-sm font-medium">法人連續賣超 (Net Institutional Selling)</p>
                        <div className="space-y-2 mt-2">
                            <div className="flex justify-between items-center bg-muted p-2 rounded">
                                <span className="font-bold text-sm">2603.TW (長榮)</span>
                                <span className="text-red-500 text-xs">-8,300 張</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
