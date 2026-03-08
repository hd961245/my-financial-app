"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Send, Loader2, Image as ImageIcon, X } from "lucide-react";

export function CommunityAssistantWidget() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [base64Image, setBase64Image] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            setError("只能上傳圖片檔案");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("圖片大小不能超過 5MB");
            return;
        }

        setError(null);
        setResult(null);

        // Optional: show preview
        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove the data:image/jpeg;base64, prefix
            const base64Data = base64String.split(',')[1];
            setBase64Image(base64Data);
        };
        reader.readAsDataURL(file);
    };

    const handleClear = () => {
        setPreview(null);
        setBase64Image(null);
        setResult(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleAnalyze = async () => {
        if (!base64Image) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/ai-vision", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    imageBase64: base64Image,
                    // optional prompt overrides
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "分析失敗");
            }

            setResult(data.result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="h-full border-green-200 shadow-sm bg-green-50/50 dark:bg-green-950/10 dark:border-green-900">
            <CardHeader className="pb-2">
                <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
                    <Camera className="w-5 h-5" />
                    社群小助手 (截圖分析)
                </CardTitle>
                <CardDescription>
                    上傳朋友傳來的對帳單、財經新聞截圖、或是各種神祕的「明牌」，讓我用 AI 幫你解析裡面的關鍵字！
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    {/* Upload Area */}
                    {!preview ? (
                        <div
                            className="border-2 border-dashed border-green-300 dark:border-green-800 rounded-md p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-green-100/50 dark:hover:bg-green-900/20 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <ImageIcon className="w-8 h-8 text-green-500 mb-2" />
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">點擊上傳圖片</p>
                            <p className="text-xs text-muted-foreground mt-1">支援 JPG, PNG (最大 5MB)</p>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleImageChange}
                            />
                        </div>
                    ) : (
                        <div className="relative border rounded-md p-2 bg-white dark:bg-zinc-950">
                            <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-4 right-4 h-6 w-6 rounded-full opacity-80 hover:opacity-100"
                                onClick={handleClear}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview} alt="Upload Preview" className="max-h-48 mx-auto rounded-sm object-contain" />
                        </div>
                    )}

                    {/* Action Button */}
                    <div className="flex gap-2">
                        <Button
                            onClick={handleAnalyze}
                            disabled={loading || !base64Image}
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 解析中...</> : <><Send className="w-4 h-4 mr-2" /> 開始解析截圖情報</>}
                        </Button>
                    </div>

                    {/* Error and Result */}
                    {error && (
                        <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm mt-2">
                            ⚠️ {error}
                        </div>
                    )}

                    {result && (
                        <div className="p-4 mt-2 bg-white dark:bg-zinc-900 rounded-md border border-green-100 dark:border-zinc-800 shadow-inner">
                            <div className="prose prose-sm dark:prose-invert max-w-none space-y-2 whitespace-pre-wrap leading-relaxed">
                                {result}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
