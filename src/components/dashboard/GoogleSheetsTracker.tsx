"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw } from "lucide-react";

type SheetItem = Record<string, string | number>;

export function GoogleSheetsTracker() {
    const [sheetId, setSheetId] = useState("");
    const [savedSheetId, setSavedSheetId] = useState("");
    const [data, setData] = useState<SheetItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Load saved Sheet ID from localStorage on mount
    useEffect(() => {
        const storedId = localStorage.getItem("googleSheetId");
        if (storedId) {
            setSheetId(storedId);
            setSavedSheetId(storedId);
        }
    }, []);

    // Fetch data when we have a saved ID
    useEffect(() => {
        if (!savedSheetId) return;

        const fetchData = async () => {
            setLoading(true);
            setError("");
            try {
                const res = await fetch(`/api/google-sheets?sheetId=${savedSheetId}`);
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || "Failed to fetch data");
                }
                const result = await res.json();
                setData(result);
            } catch (err: any) {
                setError(err.message);
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Setup polling every 1 minute
        const intervalId = setInterval(fetchData, 60000);
        return () => clearInterval(intervalId);
    }, [savedSheetId]);

    const handleSaveAndFetch = () => {
        if (!sheetId.trim()) return;

        // Extract ID if user pasted full URL
        let finalId = sheetId.trim();
        if (finalId.includes("/d/")) {
            const match = finalId.match(/\/d\/(e\/[a-zA-Z0-9-_]+|[a-zA-Z0-9-_]+)/);
            if (match && match[1]) {
                finalId = match[1];
            }
        }

        setSheetId(finalId);
        setSavedSheetId(finalId);
        localStorage.setItem("googleSheetId", finalId);
    };

    // If we have data, we dynamically extract columns based on the keys of the first row (ignoring 'id')
    const columns = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'id') : [];

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>連結 Google 試算表 (Google Sheets Link)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex space-x-2">
                        <Input
                            placeholder="貼上你的 Google 試算表 ID 或完整網址"
                            value={sheetId}
                            onChange={(e) => setSheetId(e.target.value)}
                            className="flex-1"
                        />
                        <Button onClick={handleSaveAndFetch} disabled={loading}>
                            {loading ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : null}
                            載入資料
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        請確保你的試算表權限設定為「知道連結的任何人」都可以「檢視」。
                    </p>
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                            ⚠️ 錯誤：{error}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>自選股清單 (Watchlist)</CardTitle>
                    {savedSheetId && (
                        <Button variant="outline" size="icon" onClick={() => setSavedSheetId(savedSheetId)} disabled={loading}>
                            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {data.length === 0 && !loading && !error ? (
                        <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
                            尚未匯入任何資料，請在上方輸入試算表連結。
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {columns.map(col => (
                                            <TableHead key={col}>{col}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((row) => (
                                        <TableRow key={row.id}>
                                            {columns.map(col => {
                                                const val = row[col];

                                                // Basic formatting heuristic: if it contains "損益" or "%", or "漲跌幅", style it
                                                const isPercent = col.includes('百分比') || col.includes('損益') || col.includes('漲跌幅') || col.includes('%');
                                                const isPositive = isPercent && (String(val).includes('+') || Number(String(val).replace('%', '')) > 0);
                                                const isNegative = isPercent && (String(val).includes('-') || Number(String(val).replace('%', '')) < 0);

                                                return (
                                                    <TableCell
                                                        key={`${row.id}-${col}`}
                                                        className={`
                                                            ${isPositive ? 'text-green-600 font-medium' : ''} 
                                                            ${isNegative ? 'text-red-600 font-medium' : ''}
                                                        `}
                                                    >
                                                        {val}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
