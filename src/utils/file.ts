import * as path from "path";
import * as fs from "fs";

// utility function to write text files
export async function writeTextFile(destinationPath: string, fileName: string, content: string) {
    const filePath = path.join(destinationPath, fileName);
    await fs.writeFileSync(filePath, content, "utf8");
};