# Custom Level Editor & Importer Guide

This guide explains how to create your own custom levels for the game and how to import them.

## 1. Using the In-Game Level Editor

The easiest way to create a custom level is by using the built-in level editor.

### Steps:
1. **Start the Game:** Open `index.html` in your browser.
2. **Access Editor:** Click the "Level Editor" button on the main menu.
3. **Upload Song (Optional but Recommended):**
   - Click "Upload Song (MP3)" to select an MP3 file from your computer. This will be the background music for your custom level.
   - **Important:** The editor itself doesn't play the song while editing. You'll need to listen to your song separately to time the notes.
4. **Set Level Parameters:**
   - **BPM (Beats Per Minute):** This is for reference and can help with timing if you know your song's BPM. It doesn't directly affect note speed but is part of the level data.
   - **Note Duration (ms):** This determines how long a note is visible on screen before it passes the hit point. A shorter duration means notes move faster and require quicker reactions.
   - **Gap Between Notes (ms):** This is the time interval between the appearance of consecutive notes. A shorter gap means notes appear more frequently.
5. **Add Notes:**
   - Click "Add Note" repeatedly to add notes to your sequence.
   - For each added note, use the dropdown to select its required direction (Up, Down, Left, Right).
   - You can remove notes using the "Remove" button next to each entry.
6. **Generate Level JSON:**
   - Once you're happy with your note sequence and parameters, click "Generate Level JSON".
   - The JSON data for your level will appear in a text area below. Copy this entire text.
7. **Save Your Level:**
   - Open a plain text editor (like Notepad, VS Code, Sublime Text).
   - Paste the copied JSON into the new file.
   - Save the file as `your_level_name.json` (e.g., `my_first_level.json`).

## 2. Preparing Your Custom Level ZIP File

To play your custom level in the game, you need to package your `.json` level file and your `.mp3` song file into a single `.zip` archive.

### Steps:
1. **Locate Files:**
   - Find the `.json` file you saved in the previous step (e.g., `my_first_level.json`).
   - Find the `.mp3` song file you want to use for this level (e.g., `my_song.mp3`).
2. **Create a ZIP Archive:**
   - **Windows:** Select both your `.json` file and your `.mp3` file. Right-click, then go to "Send to" -> "Compressed (zipped) folder".
   - **macOS:** Select both your `.json` file and your `.mp3` file. Right-click, then select "Compress [number] items".
   - **Linux:** Select both files, right-click, and choose "Compress" or "Create Archive", selecting the ZIP format.
3. **Name Your ZIP:** Name your zip file descriptively (e.g., `MyAwesomeLevel.zip`). The name of the ZIP file is what will be displayed in the game when you load it.
   - **Crucial:** Ensure BOTH the `.json` file and the `.mp3` file are at the **root** of the ZIP archive, not inside any subfolders within the ZIP.

## 3. Importing and Playing Your Custom Level

### Steps:
1. **Start the Game:** Open `index.html` in your browser.
2. **Access Editor (again):** Click the "Level Editor" button on the main menu.
3. **Load Custom Level:** Click the "Load Custom Level (ZIP)" button.
4. **Select Your ZIP:** A file dialog will open. Navigate to and select the `.zip` file you created.
5. **Confirmation:** If loaded successfully, you will see an alert confirming the level is ready, and you will be returned to the main menu.
6. **Play:** Click "Start Game". Your custom level with your chosen song and note sequence will begin!

## Troubleshooting

- **"ZIP file must contain a .json level file." / "ZIP file must contain an .mp3 song file."**: Make sure both files are present directly in the root of your ZIP.
- **"Failed to load custom level."**: Ensure your `.json` file is valid JSON (you can use an online JSON validator if unsure). Also, confirm your `.mp3` file is not corrupted.
- **Timing issues**: The in-game editor doesn't play music, so precise timing requires external tools or trial-and-error. Adjust `Note Duration` and `Gap Between Notes` to fine-tune the feel of your level.

