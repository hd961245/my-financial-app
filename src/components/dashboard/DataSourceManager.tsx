"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Link } from "lucide-react";

interface DataSource {
    id: string;
    name: string;
    url: string;
    type: string;
    createdAt: string;
}

export function DataSourceManager() {
    const [sources, setSources] = useState<DataSource[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [type, setType] = useState("RSS");

    const fetchSources = async () => {
        try {
            const res = await fetch("/api/data-sources");
            if (res.ok) {
                const data = await res.json();
                setSources(data);
            }
        } catch (err) {
            console.error("Failed to fetch sources", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    const handleAddSource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url) return;

        try {
            const res = await fetch("/api/data-sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, url, type })
            });

            if (res.ok) {
                setName("");
                setUrl("");
                setType("RSS");
                fetchSources();
            }
        } catch (err) {
            console.error("Failed to add source", err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("確定要刪除這個資料源嗎？(Are you sure?)")) return;
        try {
            const res = await fetch(`/api/data-sources?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchSources();
            }
        } catch (err) {
            console.error("Failed to delete source", err);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>管理自訂網站 (Manage Custom Sources)</CardTitle>
                    <CardDescription>您可以新增常看的財經部落格 RSS 或一般網頁，我們將自動抓取最新文章標題。 (Add RSS feeds or HTML sites to monitor.)</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAddSource} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
                        <Input
                            placeholder="網站名稱 (Site Name)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="md:w-1/4"
                        />
                        <Input
                            placeholder="網址 (URL e.g., https://example.com/feed)"
                            value={url}
                            type="url"
                            onChange={(e) => setUrl(e.target.value)}
                            className="flex-1"
                        />
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="網頁類型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="RSS">RSS Feed</SelectItem>
                                <SelectItem value="HTML">HTML Page</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button type="submit">新增 (Add)</Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>已儲存的資料源 (Saved Sources)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>名稱 (Name)</TableHead>
                                <TableHead>網址 (URL)</TableHead>
                                <TableHead>類型 (Type)</TableHead>
                                <TableHead className="text-right">操作 (Action)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">載入中...</TableCell>
                                </TableRow>
                            ) : sources.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">目前沒有自訂資料源 (No custom sources yet).</TableCell>
                                </TableRow>
                            ) : (
                                sources.map((source) => (
                                    <TableRow key={source.id}>
                                        <TableCell className="font-medium">{source.name}</TableCell>
                                        <TableCell>
                                            <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline text-blue-500">
                                                <Link className="h-3 w-3 mr-1" />
                                                {source.url.length > 50 ? source.url.substring(0, 50) + '...' : source.url}
                                            </a>
                                        </TableCell>
                                        <TableCell>{source.type}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
