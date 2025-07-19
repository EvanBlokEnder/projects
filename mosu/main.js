import * as THREE from 'three';
import * as TWEEN from 'tween'; // Import TWEEN

let scene, camera, renderer;
let currentNote = null; // Only one note at a time
let gameStarted = false;
let score = 0;
let combo = 0; // Initialize combo counter
const maxComboResetTime = 1000; // Time in ms to reset combo after a miss
let lastHitTime = 0;
let hitSoundBuffer, missSoundBuffer;
let audioContext;
let currentMusic;
let musicVolume = 0.5; // Initial volume

const noteSpeed = 0.05; // Initial speed
let currentNoteSpeed = noteSpeed;
const speedIncreaseFactor = 0.00005; // How much speed increases per frame

// Level editor variables
let customLevel = null;
let customSongBuffer = null;
let noteSequence = []; // Stores the sequence of notes for the current level
let currentNoteIndex = 0;
let nextNoteTime = 0; // When the next note should appear (in game time, ms)
let levelBPM = 120; // Default BPM
let levelNoteDuration = 1000; // Default note duration (ms)
let levelGapBetweenNotes = 500; // Default gap between notes (ms)
let gameStartTime = 0; // To track elapsed time in game

// No sabers or associated logic
const COLORS = {
    note: 0x00ffff // Cyan color for notes
};

const NOTE_DIRECTIONS = {
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    ANY: 'any' // Dot note (removed, all notes will have directions now)
};

const playSound = (buffer, volume = 1.0) => {
    if (!audioContext) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
};

// Function to load audio
const loadAudio = async (url) => {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    } catch (error) {
        console.error('Error loading audio:', error);
        return null;
    }
};

const initAudio = async () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    hitSoundBuffer = await loadAudio('hitsound.mp3');
    missSoundBuffer = await loadAudio('misssound.mp3');
    currentMusic = document.getElementById('background-music');
    // Set the source for the background music
    currentMusic.src = 'background_music.mp3';
    currentMusic.volume = musicVolume; // Ensure volume is set after source
};

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    camera.position.set(0, 0, 5); // Position camera to view a full screen block directly
    camera.lookAt(0, 0, 0);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // No saber, no ground plane

    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('keydown', onKeyDown); // Add keyboard event listener

    document.getElementById('start-button').addEventListener('click', startGame);
    document.getElementById('editor-button').addEventListener('click', openEditor);
    document.getElementById('add-note-button').addEventListener('click', addNoteToEditor);
    document.getElementById('generate-json-button').addEventListener('click', generateLevelJSON);
    document.getElementById('load-level-button').addEventListener('click', loadCustomLevel);
    document.getElementById('back-to-menu-button').addEventListener('click', closeEditor);

    initAudio();
    updateScoreDisplay(); // Initialize score display
}

// Simplified createNote function for a single, full-screen block
function createNote(directionOverride = null) {
    // Remove existing note if any
    if (currentNote) {
        scene.remove(currentNote);
        currentNote = null;
    }

    const noteGroup = new THREE.Group();
    // Calculate size to make it appear full screen from distance 0
    const frustumHeight = 2 * Math.tan(camera.fov * 0.5 * Math.PI / 180) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;
    
    // Make the block slightly smaller than frustum to show background
    const size = Math.min(frustumWidth, frustumHeight) * 0.9; 

    const boxGeometry = new THREE.BoxGeometry(size, size, 0.1); // Thin box
    const materialColor = COLORS.note;
    const boxMaterial = new THREE.MeshStandardMaterial({ color: materialColor });
    const note = new THREE.Mesh(boxGeometry, boxMaterial);
    noteGroup.add(note);

    const directions = [NOTE_DIRECTIONS.UP, NOTE_DIRECTIONS.DOWN, NOTE_DIRECTIONS.LEFT, NOTE_DIRECTIONS.RIGHT];
    const direction = directionOverride || directions[Math.floor(Math.random() * directions.length)];

    // Create an arrow shape using PlaneGeometry with a texture or custom vertices
    const arrowGeometry = new THREE.PlaneGeometry(size * 0.5, size * 0.5); // Arrow size relative to block
    const arrowCanvas = document.createElement('canvas');
    arrowCanvas.width = 128;
    arrowCanvas.height = 128;
    const ctx = arrowCanvas.getContext('2d');

    // Draw an arrow
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(64, 10);
    ctx.lineTo(108, 80);
    ctx.lineTo(80, 80);
    ctx.lineTo(80, 118);
    ctx.lineTo(48, 118);
    ctx.lineTo(48, 80);
    ctx.lineTo(20, 80);
    ctx.closePath();
    ctx.fill();

    const arrowTexture = new THREE.CanvasTexture(arrowCanvas);
    const arrowMaterial = new THREE.MeshBasicMaterial({ map: arrowTexture, transparent: true, side: THREE.DoubleSide });
    const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);

    arrowMesh.position.z = 0.06; // Slightly in front of the box face
    
    // Rotate the arrow to the correct direction
    switch (direction) {
        case NOTE_DIRECTIONS.UP:
            arrowMesh.rotation.z = 0;
            break;
        case NOTE_DIRECTIONS.DOWN:
            arrowMesh.rotation.z = Math.PI;
            break;
        case NOTE_DIRECTIONS.LEFT:
            arrowMesh.rotation.z = Math.PI / 2;
            break;
        case NOTE_DIRECTIONS.RIGHT:
            arrowMesh.rotation.z = -Math.PI / 2;
            break;
    }
    noteGroup.add(arrowMesh);

    noteGroup.position.z = -10; // Spawn far back
    noteGroup.userData = { direction, hit: false, spawnTime: performance.now() }; // Store spawn time for accurate miss detection
    scene.add(noteGroup);
    currentNote = noteGroup;

    // Calculate the 'reaction time window' for the note
    const distanceToTravel = Math.abs(currentNote.position.z - camera.position.z);
    // The note will reach camera.position.z in (distanceToTravel / currentNoteSpeed) frames.
    // Assuming 60fps, time in ms = (distanceToTravel / currentNoteSpeed) / 60 * 1000
    // This is the total time it takes for the note to travel from spawn to the camera.
    // We want the hit window to be related to 'levelNoteDuration' (which is the target for a full block)
    // For a constant speed, a note appears for levelNoteDuration before it passes
    currentNote.userData.reactionWindowStart = gameStartTime + nextNoteTime - levelNoteDuration;
    currentNote.userData.reactionWindowEnd = gameStartTime + nextNoteTime;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startGame() {
    gameStarted = true;
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('editor-overlay').style.display = 'none'; // Ensure editor is hidden
    document.getElementById('game-info').style.display = 'flex'; // Show game info
    
    score = 0;
    combo = 0; // Reset combo
    updateScoreDisplay(); // Update display
    currentNoteSpeed = noteSpeed; // Reset speed for new game

    currentNoteIndex = 0;
    gameStartTime = performance.now(); // Record game start time
    nextNoteTime = 0; // First note appears immediately or after first delay

    if (customLevel && customSongBuffer) {
        currentMusic.src = ''; // Clear default music source
        const audioSource = audioContext.createBufferSource();
        audioSource.buffer = customSongBuffer;
        audioSource.connect(audioContext.destination);
        audioSource.start(0);
        currentMusic.audioNode = audioSource; // Store for stopping later
        
        noteSequence = customLevel.notes;
        levelBPM = customLevel.bpm;
        levelNoteDuration = customLevel.noteDuration;
        levelGapBetweenNotes = customLevel.gapBetweenNotes;

        // Immediately spawn the first note if exists
        if (noteSequence.length > 0) {
            nextNoteTime = 0; // The first note should be ready at time 0
            scheduleNextNote();
        } else {
            console.warn("No notes in custom level.");
            // Maybe end game or provide feedback
        }

    } else {
        // Default game mode (random notes, fixed speed increase)
        currentMusic.src = 'background_music.mp3'; // Restore default music source if needed
        currentMusic.play();
        noteSequence = []; // Clear any custom notes
        createNote(); // Create the first random note
    }
}

function onKeyDown(event) {
    if (!gameStarted || !currentNote || currentNote.userData.hit) {
        if (event.key.toLowerCase() === 'm' && gameStarted) { // Check if 'm' is pressed during a game
            endGame(); // Call endGame to return to main menu
            return;
        }
        return; // Exit if game not started or note already hit
    }

    const requiredDirection = currentNote.userData.direction;
    let correctHit = false;

    switch (event.key.toLowerCase()) {
        case 'w':
            if (requiredDirection === NOTE_DIRECTIONS.UP) correctHit = true;
            break;
        case 's':
            if (requiredDirection === NOTE_DIRECTIONS.DOWN) correctHit = true;
            break;
        case 'a':
            if (requiredDirection === NOTE_DIRECTIONS.LEFT) correctHit = true;
            break;
        case 'd':
            if (requiredDirection === NOTE_DIRECTIONS.RIGHT) correctHit = true;
            break;
    }

    const currentTime = performance.now();
    const hitWindowGrace = 100; // ms of grace time around the ideal hit window

    // For custom levels, check if hit is within the expected window
    let inHitWindow = true;
    if (customLevel) {
        inHitWindow = currentTime >= currentNote.userData.reactionWindowStart - hitWindowGrace &&
                      currentTime <= currentNote.userData.reactionWindowEnd + hitWindowGrace;
    }
    
    if (correctHit && inHitWindow) {
        console.log("Correct hit!");
        currentNote.userData.hit = true;
        score++;
        combo++;
        lastHitTime = performance.now();
        updateScoreDisplay();
        playSound(hitSoundBuffer);
        showFeedback('Perfect!');
        // Animate scale down and remove note
        new TWEEN.Tween(currentNote.scale)
            .to({ x: 0, y: 0, z: 0 }, 150)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                scene.remove(currentNote);
                currentNote = null; // Clear current note
                if (!customLevel) { // Only spawn immediately in default mode
                    createNote();
                }
            })
            .start();
    } else {
        console.log("Wrong direction or outside window!");
        playSound(missSoundBuffer, 0.7);
        combo = 0;
        updateScoreDisplay();
        showFeedback('Miss!');
        // Indicate a miss visually (e.g., flash red or scale down)
        new TWEEN.Tween(currentNote.scale)
            .to({ x: 0, y: 0, z: 0 }, 150)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                scene.remove(currentNote);
                currentNote = null; // Clear current note
                if (!customLevel) { // Only spawn immediately in default mode
                    createNote();
                }
            })
            .start();
    }
}

function update() {
    requestAnimationFrame(update);
    TWEEN.update(); // Update TWEEN animations

    if (gameStarted) {
        if (!customLevel) {
            currentNoteSpeed += speedIncreaseFactor; // Gradually increase speed in default mode
        } else {
            // In custom level, note speed is determined by levelNoteDuration
            // Calculate speed based on levelNoteDuration
            // Note: This needs to be constant per note, not continuously increasing
            // The note should reach z=0 in `levelNoteDuration` milliseconds from its spawn.
            // Distance = -currentNote.position.z (initial spawn is -10)
            // Speed = Distance / (levelNoteDuration / 1000) (units per second)
            // In each frame (approx 16.67ms at 60fps), it moves Speed * (16.67 / 1000)
            // A simpler approach for custom levels: adjust note's initial Z based on noteDuration
            // or modify position based on `elapsedTime` from gameStartTime.

            // To make a note arrive at z=0 after `levelNoteDuration` ms:
            // currentNote.position.z starts at -10.
            // When gameTime - currentNote.userData.spawnTime = levelNoteDuration, currentNote.position.z should be 0.
            // So, currentNote.position.z = -10 + (gameTime - currentNote.userData.spawnTime) / levelNoteDuration * 10;
            // This is handled better when spawning notes in scheduleNextNote

            const currentTime = performance.now();
            const elapsedTime = currentTime - gameStartTime;

            // Handle spawning of notes based on custom level sequence
            if (customLevel && currentNoteIndex < noteSequence.length) {
                if (elapsedTime >= nextNoteTime && !currentNote) {
                    const noteData = noteSequence[currentNoteIndex];
                    createNote(noteData.direction);
                    
                    // Reset spawn time for accurate timing calculations
                    currentNote.userData.spawnTime = currentTime; 

                    currentNoteIndex++;
                    // Calculate time for next note
                    if (currentNoteIndex < noteSequence.length) {
                        nextNoteTime += levelGapBetweenNotes;
                    }
                }
            } else if (customLevel && currentNoteIndex >= noteSequence.length && !currentNote) {
                // All notes played, end game or transition
                console.log("Custom level finished!");
                endGame();
            }

            if (currentNote) {
                // Move current note based on custom level's note duration
                const noteElapsedTime = currentTime - currentNote.userData.spawnTime;
                // Note should travel from -10 to 0 in levelNoteDuration milliseconds
                // currentNote.position.z = THREE.MathUtils.lerp(-10, 0, noteElapsedTime / levelNoteDuration);
                // Make it pass slightly past 0 for miss detection if not hit
                currentNote.position.z = -10 + (noteElapsedTime / levelNoteDuration) * 11; // Travels from -10 to ~1

                 // If note passes the player without being hit
                if (currentNote.position.z > camera.position.z + 0.5 && !currentNote.userData.hit) {
                    console.log("Missed a note!");
                    playSound(missSoundBuffer, 0.7); // Play miss sound
                    combo = 0; // Reset combo on miss
                    updateScoreDisplay();
                    showFeedback('Miss!');
                    scene.remove(currentNote);
                    currentNote = null;
                    // No automatic new note creation in custom level, relies on schedule
                }
            }
        }

        // Default mode note movement and miss detection
        if (!customLevel && currentNote) {
            currentNote.position.z += currentNoteSpeed; // Move note towards the player

            // If note passes the player without being hit
            if (currentNote.position.z > camera.position.z + 1 && !currentNote.userData.hit) {
                console.log("Missed a note!");
                playSound(missSoundBuffer, 0.7); // Play miss sound
                combo = 0; // Reset combo on miss
                updateScoreDisplay();
                showFeedback('Miss!');
                scene.remove(currentNote);
                currentNote = null;
                createNote(); // Spawn a new note
            }
        }
        
        // Combo reset logic based on time
        if (combo > 0 && performance.now() - lastHitTime > maxComboResetTime) {
            combo = 0;
            updateScoreDisplay();
        }
    }

    renderer.render(scene, camera);
}

function updateScoreDisplay() {
    const scoreElement = document.getElementById('score');
    const comboElement = document.getElementById('combo');
    if (scoreElement) {
        scoreElement.innerText = `Score: ${score}`;
    }
    if (comboElement) {
        comboElement.innerText = `Combo: ${combo}`;
    }
}

function showFeedback(message) {
    const feedbackElement = document.getElementById('feedback-message');
    feedbackElement.innerText = message;
    feedbackElement.style.opacity = 1;

    // Fade out after a short delay
    new TWEEN.Tween({ opacity: 1 })
        .to({ opacity: 0 }, 500)
        .delay(300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate((obj) => {
            feedbackElement.style.opacity = obj.opacity;
        })
        .start();
}

function endGame() {
    gameStarted = false;
    currentMusic.pause();
    currentMusic.currentTime = 0;
    if (currentMusic.audioNode) {
        currentMusic.audioNode.stop();
        currentMusic.audioNode.disconnect();
        currentMusic.audioNode = null;
    }
    
    if (currentNote) {
        scene.remove(currentNote);
        currentNote = null;
    }
    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('game-info').style.display = 'none';
    document.getElementById('controller-status').innerText = `Game Over! Score: ${score}`;
    customLevel = null; // Clear custom level for next game
    customSongBuffer = null;
}

function scheduleNextNote() {
    if (!gameStarted || !customLevel || currentNoteIndex >= noteSequence.length) return;

    // The note will be created right when its `nextNoteTime` arrives during `update` loop.
    // The visual timing is handled by `currentNote.position.z` in the `update` loop.
    // The time between notes is `levelGapBetweenNotes`.
    // The first note has nextNoteTime of 0.
    // Subsequent notes add `levelGapBetweenNotes` to `nextNoteTime`.
}

// Level Editor Functions
function openEditor() {
    gameStarted = false;
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('game-info').style.display = 'none';
    document.getElementById('editor-overlay').style.display = 'block';

    // Clear previous note sequence and editor UI
    noteSequence = [];
    renderNoteSequenceEditor();
    document.getElementById('json-output').style.display = 'none';
    document.getElementById('json-output').innerText = '';

    // Reset editor values
    document.getElementById('editor-bpm').value = levelBPM;
    document.getElementById('editor-note-duration').value = levelNoteDuration;
    document.getElementById('editor-gap-between-notes').value = levelGapBetweenNotes;
    document.getElementById('editor-song-upload').value = ''; // Clear file input
    customSongBuffer = null; // Clear any loaded custom song
}

function closeEditor() {
    document.getElementById('editor-overlay').style.display = 'none';
    document.getElementById('overlay').style.display = 'flex';
}

function addNoteToEditor() {
    const directions = [NOTE_DIRECTIONS.UP, NOTE_DIRECTIONS.DOWN, NOTE_DIRECTIONS.LEFT, NOTE_DIRECTIONS.RIGHT];
    const defaultDirection = directions[0]; // Default to UP
    noteSequence.push({ direction: defaultDirection });
    renderNoteSequenceEditor();
}

function removeNoteFromEditor(index) {
    noteSequence.splice(index, 1);
    renderNoteSequenceEditor();
}

function updateNoteDirection(index, newDirection) {
    if (noteSequence[index]) {
        noteSequence[index].direction = newDirection;
    }
}

function renderNoteSequenceEditor() {
    const container = document.getElementById('notes-sequence-editor');
    container.innerHTML = ''; // Clear existing entries

    noteSequence.forEach((note, index) => {
        const div = document.createElement('div');
        div.className = 'note-entry';

        const span = document.createElement('span');
        span.innerText = `Note ${index + 1}:`;
        div.appendChild(span);

        const select = document.createElement('select');
        select.innerHTML = `
            <option value="up" ${note.direction === 'up' ? 'selected' : ''}>Up</option>
            <option value="down" ${note.direction === 'down' ? 'selected' : ''}>Down</option>
            <option value="left" ${note.direction === 'left' ? 'selected' : ''}>Left</option>
            <option value="right" ${note.direction === 'right' ? 'selected' : ''}>Right</option>
        `;
        select.addEventListener('change', (e) => updateNoteDirection(index, e.target.value));
        div.appendChild(select);

        const removeButton = document.createElement('button');
        removeButton.innerText = 'Remove';
        removeButton.addEventListener('click', () => removeNoteFromEditor(index));
        div.appendChild(removeButton);

        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight; // Scroll to bottom
}

function generateLevelJSON() {
    const bpm = parseFloat(document.getElementById('editor-bpm').value);
    const noteDuration = parseFloat(document.getElementById('editor-note-duration').value);
    const gapBetweenNotes = parseFloat(document.getElementById('editor-gap-between-notes').value);

    const levelData = {
        bpm: isNaN(bpm) ? 120 : bpm,
        noteDuration: isNaN(noteDuration) ? 1000 : noteDuration,
        gapBetweenNotes: isNaN(gapBetweenNotes) ? 500 : gapBetweenNotes,
        notes: noteSequence.map(n => ({ direction: n.direction }))
    };

    const jsonOutput = document.getElementById('json-output');
    jsonOutput.innerText = JSON.stringify(levelData, null, 2);
    jsonOutput.style.display = 'block';
}

async function loadCustomLevel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')).default;
            const zip = await JSZip.loadAsync(file);
            let levelJsonFile = null;
            let songMp3File = null;

            zip.forEach((relativePath, zipEntry) => {
                if (relativePath.endsWith('.json')) {
                    levelJsonFile = zipEntry;
                } else if (relativePath.endsWith('.mp3')) {
                    songMp3File = zipEntry;
                }
            });

            if (!levelJsonFile) {
                alert('ZIP file must contain a .json level file.');
                return;
            }
            if (!songMp3File) {
                alert('ZIP file must contain an .mp3 song file.');
                return;
            }

            const levelJsonString = await levelJsonFile.async('text');
            customLevel = JSON.parse(levelJsonString);

            const songArrayBuffer = await songMp3File.async('arraybuffer');
            customSongBuffer = await audioContext.decodeAudioData(songArrayBuffer);

            alert('Custom level loaded successfully! Press Start Game to play.');
            closeEditor(); // Return to main menu
            document.getElementById('controller-status').innerText = `Custom Level: "${file.name}" ready!`;

        } catch (error) {
            console.error('Error loading custom level:', error);
            alert('Failed to load custom level. Make sure it\'s a valid ZIP with a .json and .mp3 file.');
            customLevel = null;
            customSongBuffer = null;
        }
    };
    input.click();
}

init();
update(); // Start the game loop