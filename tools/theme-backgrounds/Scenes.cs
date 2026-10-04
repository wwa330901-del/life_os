using System;

public static class Scenes
{
    const int W = 1600, H = 1000;

    public static void All(string dir)
    {
        Dawn(dir + "\\01-dawn.jpg");
        InkGold(dir + "\\02-ink-gold.jpg");
        Paper(dir + "\\03-paper.jpg");
        Forest(dir + "\\04-forest.jpg");
        Ocean(dir + "\\05-ocean.jpg");
        Sakura(dir + "\\06-sakura.jpg");
        Night(dir + "\\07-night.jpg");
        Nordic(dir + "\\08-nordic.jpg");
        Retro(dir + "\\09-retro.jpg");
        Candy(dir + "\\10-candy.jpg");
    }

    // 1 晨光：清晨薄霧的層層山巒，太陽剛升起
    public static void Dawn(string path)
    {
        var p = new Painter(W, H, 1);
        p.Sky("#F6E3CC", "#F8D9B4", "#F3E6D6", 0.55);
        p.Glow(0.72, 0.52, 0.28, "#FFE9C7", 0.9);
        p.Glow(0.72, 0.52, 0.07, "#FFF6E6", 0.9);
        p.Ridge(0.56, 0.06, 1.2, 11, "#E3C3A2", "#F4E2CC", 0.12, 0.7, false, 0.9);
        p.Mist("#F7E7D3", 0.5, 0.5, 0.7, 3, 12, 2.2);
        p.Ridge(0.64, 0.07, 1.6, 13, "#CFA987", "#EED8BF", 0.14, 0.75, false, 0.9);
        p.Mist("#F5E4CF", 0.55, 0.6, 0.8, 3.5, 14, 2.2);
        p.Ridge(0.74, 0.06, 2.2, 15, "#B98F6E", "#E7CCAE", 0.16, 0.7, false, 0.9);
        p.Mist("#F3E1CB", 0.5, 0.7, 0.92, 4, 16, 2.0);
        p.Ridge(0.86, 0.05, 3, 17, "#A27A5B", "#D9B897", 0.18, 0.6, false, 0.95);
        p.Grain(0.025);
        p.Fade("#FBF5EC", 0.42);
        p.Save(path);
    }

    // 2 墨與金：夜裡的山，山稜邊緣有一點金色的光，金色薄霧
    public static void InkGold(string path)
    {
        var p = new Painter(W, H, 2);
        p.Sky("#0E0D0B", "#1A160F", "#14120E", 0.6);
        p.Glow(0.78, 0.22, 0.22, "#5A4524", 0.55);
        p.Disc(0.78, 0.22, 0.032, "#E7CF9C", 0.55);
        p.Glow(0.78, 0.22, 0.05, "#D4A657", 0.35);
        p.Ridge(0.52, 0.09, 1.3, 21, "#2A241A", "#1A1711", 0.2, 0.7, true, 1);
        p.Mist("#6B5530", 0.35, 0.45, 0.7, 3, 22, 2.4);
        p.Ridge(0.64, 0.08, 1.8, 23, "#1D1A14", "#15130F", 0.2, 0.6, true, 1);
        p.Mist("#5A4728", 0.3, 0.58, 0.82, 3.5, 24, 2.4);
        p.Ridge(0.78, 0.07, 2.6, 25, "#13110D", "#0F0E0B", 0.2, 0.5, true, 1);
        p.Grain(0.03);
        p.Fade("#16140F", 0.3);
        p.Save(path);
    }

    // 3 留白與朱印：水墨遠山，山腳化成霧，淡淡紅日
    public static void Paper(string path)
    {
        var p = new Painter(W, H, 3);
        p.Sky("#F4F0E8", "#F6F2EA", "#F2EEE6", 0.5);
        p.Disc(0.8, 0.24, 0.045, "#C9604F", 0.55);
        p.Ridge(0.5, 0.14, 1.1, 31, "#B8B3AA", "#F2EEE6", 0.16, 1, true, 0.85);
        p.Ridge(0.62, 0.16, 1.5, 33, "#8E8981", "#F2EEE6", 0.18, 1, true, 0.85);
        p.Mist("#F4F0E8", 0.6, 0.6, 0.85, 3, 34, 2.4);
        p.Ridge(0.78, 0.12, 2.2, 35, "#57534D", "#F2EEE6", 0.2, 1, true, 0.8);
        p.Grain(0.035);
        p.Fade("#F7F4EE", 0.38);
        p.Save(path);
    }

    // 4 森林：晨霧裡的針葉林，一層一層往遠方淡去
    public static void Forest(string path)
    {
        var p = new Painter(W, H, 4);
        p.Sky("#E4EBDF", "#EDF1E6", "#E2E9DC", 0.5);
        p.Glow(0.3, 0.25, 0.3, "#F7F3DF", 0.6);
        p.TreeLine(0.5, 0.03, 0.07, 0.007, 260, 41, "#C2CFB8", "#E4EBDF", 0.06, 0.85, 0.85);
        p.Mist("#E9EFE3", 0.7, 0.42, 0.66, 3, 42, 2.2);
        p.TreeLine(0.6, 0.035, 0.1, 0.009, 200, 43, "#9DB091", "#DCE5D4", 0.08, 0.85, 0.9);
        p.Mist("#E6EDE0", 0.65, 0.52, 0.8, 3.5, 44, 2.2);
        p.TreeLine(0.72, 0.04, 0.14, 0.012, 120, 45, "#6F8865", "#C9D6BE", 0.1, 0.8, 0.92);
        p.Mist("#E2EADB", 0.55, 0.66, 0.94, 4, 46, 2.0);
        p.TreeLine(0.9, 0.03, 0.22, 0.018, 50, 47, "#4A6243", "#8FA383", 0.1, 0.6, 1);
        p.Grain(0.03);
        p.Fade("#EEF2E8", 0.4);
        p.Save(path);
    }

    // 5 海洋：平靜海面，遠方地平線，近處有細細的浪紋和反光
    public static void Ocean(string path)
    {
        var p = new Painter(W, H, 5);
        p.Sky("#D7E7EE", "#E8F1F4", "#F2F6F5", 0.6);
        p.Mist("#FFFFFF", 0.35, 0.05, 0.45, 2.5, 51, 2.0);
        p.Glow(0.7, 0.42, 0.2, "#FFFFFF", 0.5);
        p.Sea(0.5, "#A9C9D4", "#3F7488", "#E8F3F6", 52);
        p.Glow(0.7, 0.55, 0.12, "#FFFFFF", 0.35);
        p.Grain(0.025);
        p.Fade("#E6F0F3", 0.42);
        p.Save(path);
    }

    // 6 櫻花：失焦的櫻花光斑，像透過鏡頭看樹下
    public static void Sakura(string path)
    {
        var p = new Painter(W, H, 6);
        p.Sky("#F7E6EA", "#FBF0F2", "#F3E3E2", 0.6);
        p.Glow(0.55, 0.25, 0.35, "#FFFFFF", 0.6);
        var pinkFar = new[] { "#EBC3CC", "#F0D0D7", "#E6B7C2" };
        var pinkNear = new[] { "#EFA9B9", "#F4BFCB", "#F8D5DD", "#E897AA", "#FFFFFF" };
        // 遠處一排櫻花樹，隱在霧裡
        for (int i = 0; i < 9; i++)
            p.CherryTree(0.05 + i * 0.115, 0.74, 0.32, 600 + i, "#B9A3A4", pinkFar, 0.55, 0.8);
        p.Mist("#FBF0F2", 0.6, 0.45, 0.85, 3, 62, 2.2);
        // 中景
        p.CherryTree(0.33, 0.9, 0.55, 611, "#9A7D7C", pinkNear, 0.7, 1.0);
        p.CherryTree(0.62, 0.92, 0.5, 612, "#9A7D7C", pinkNear, 0.7, 1.0);
        p.Mist("#FBF0F2", 0.35, 0.6, 1.0, 3.5, 63, 2.0);
        // 近景左右兩棵
        p.CherryTree(0.06, 1.02, 0.85, 621, "#6E5352", pinkNear, 0.85, 1.1);
        p.CherryTree(0.95, 1.02, 0.8, 622, "#6E5352", pinkNear, 0.85, 1.1);
        // 地上一層落花
        p.Mist("#F2C4CE", 0.5, 0.88, 1.08, 6, 64, 2.4);
        // 飄落的花瓣
        p.Bokeh(140, 65, new[] { "#F4BFCB", "#FFFFFF", "#EFA9B9" }, 0.002, 0.005, 0.7, 0.05, 1);
        p.Grain(0.02);
        p.Fade("#FDF4F5", 0.36);
        p.Save(path);
    }

    // 7 星空：銀河斜過夜空，下面是山的剪影
    public static void Night(string path)
    {
        var p = new Painter(W, H, 7);
        p.Sky("#0A0E20", "#121936", "#1F2850", 0.72);
        p.Glow(0.5, 0.95, 0.45, "#34407A", 0.55);
        p.Stars(1600, 73, 0.85);
        p.Galaxy(0.75, 71);
        p.Ridge(0.82, 0.08, 1.6, 75, "#11162F", "#0C1024", 0.2, 0.5, true, 1);
        p.Ridge(0.92, 0.05, 2.4, 77, "#080B19", "#070914", 0.2, 0.5, false, 1);
        p.Grain(0.02);
        p.Fade("#141A33", 0.14);
        p.Save(path);
    }

    // 8 北歐簡約：雪山與平靜的霧，冷灰藍
    public static void Nordic(string path)
    {
        var p = new Painter(W, H, 8);
        p.Sky("#CFD8E4", "#DCE3EC", "#E6EBF1", 0.55);
        p.Ridge(0.55, 0.18, 1.2, 81, "#FAFBFD", "#AEB9C8", 0.22, 0.9, true, 0.95);
        p.Mist("#E6EBF1", 0.35, 0.55, 0.78, 3, 82, 2.2);
        p.Ridge(0.72, 0.14, 1.7, 83, "#EEF2F6", "#93A0B2", 0.2, 0.9, true, 0.95);
        p.Mist("#E9EDF2", 0.45, 0.72, 0.98, 3.5, 84, 2.2);
        p.Ridge(0.9, 0.03, 2.5, 85, "#C9D1DC", "#E3E8EF", 0.1, 0.5, false, 0.9);
        p.Grain(0.02);
        p.Fade("#F4F5F7", 0.42);
        p.Save(path);
    }

    // 9 復古：黃昏沙丘，暖色、有底片顆粒
    public static void Retro(string path)
    {
        var p = new Painter(W, H, 9);
        p.Sky("#EFD3A6", "#F2C38A", "#EBC9A0", 0.55);
        p.Glow(0.68, 0.5, 0.25, "#F9D79A", 0.8);
        p.Disc(0.68, 0.5, 0.06, "#F4B66A", 0.6);
        p.Dune(0.58, 0.05, 1.4, 91, "#E3B583", "#C78E62", 0.85);
        p.Mist("#F1D2A8", 0.35, 0.52, 0.7, 3, 92, 2.0);
        p.Dune(0.68, 0.06, 1.9, 93, "#D69E6C", "#AD6F48", 0.9);
        p.Dune(0.8, 0.06, 2.5, 95, "#C7895A", "#94593A", 0.92);
        p.Dune(0.92, 0.04, 3.2, 97, "#B47548", "#7F4A2F", 0.95);
        p.Grain(0.06);
        p.Fade("#F5EBD7", 0.4);
        p.Save(path);
    }

    // 10 馬卡龍：粉嫩天空裡柔軟的雲
    public static void Candy(string path)
    {
        var p = new Painter(W, H, 10);
        p.Sky("#F9E3EA", "#FBEEE6", "#E6EEF3", 0.55);
        p.Glow(0.25, 0.3, 0.3, "#E7DDF6", 0.6);
        p.Glow(0.8, 0.7, 0.3, "#D6EFE6", 0.6);
        p.Sky("#F3CBD8", "#F8DCCF", "#CFE3EC", 0.55);
        p.Glow(0.2, 0.25, 0.3, "#D9C9F0", 0.7);
        p.Glow(0.85, 0.75, 0.3, "#BFE6D8", 0.7);
        // 雲：亮面＋底下一層淡淡的陰影，看起來有體積
        p.Mist("#E8C9D6", 0.55, 0.12, 0.62, 2.0, 104, 3.2);
        p.Mist("#FFFFFF", 0.95, 0.08, 0.58, 2.0, 101, 3.4);
        p.Mist("#E9D2CC", 0.5, 0.45, 0.98, 2.4, 105, 3.2);
        p.Mist("#FFFFFF", 0.9, 0.42, 0.95, 2.4, 102, 3.4);
        p.Grain(0.02);
        p.Fade("#FFF8F1", 0.3);
        p.Save(path);
    }
}
