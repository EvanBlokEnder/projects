import * as THREE from 'three';
import * as TWEEN from 'tween'; // Import TWEEN

let scene, camera, renderer;
let redSaber, blueSaber;
let notes = [];
let gameStarted = false;
let controllerConnected = false;
let gamePadIndex = null;
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

const sabers = {
    red: { object: null, velocity: new THREE.Vector3(), targetPosition: new THREE.Vector3(0.5, 0, -1) },
    blue: { object: null, velocity: new THREE.Vector3(), targetPosition: new THREE.Vector3(-0.5, 0, -1) }
};

const SABER_SMOOTHING = 0.1; // Lower values mean more smoothing

const COLORS = {
    red: 0xff0000,
    blue: 0x0000ff
};

const NOTE_TYPES = {
    RED: 'red',
    BLUE: 'blue'
};

const NOTE_DIRECTIONS = {
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    ANY: 'any' // Dot note
};

const initialSaberPosition = {
    red: new THREE.Vector3(0.5, 0, -1),
    blue: new THREE.Vector3(-0.5, 0, -1)
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

// Gamepad connection and disconnection handlers
window.addEventListener("gamepadconnected", (e) => {
    console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
        e.gamepad.index, e.gamepad.id,
        e.gamepad.buttons.length, e.gamepad.axes.length);
    gamePadIndex = e.gamepad.index;
    controllerConnected = true;
    document.getElementById('controller-status').innerText = 'Controller connected!';
    document.getElementById('start-button').style.display = 'block';
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("Gamepad disconnected from index %d: %s",
        e.gamepad.index, e.gamepad.id);
    gamePadIndex = null;
    controllerConnected = false;
    gameStarted = false;
    document.getElementById('controller-status').innerText = 'Connect a controller...';
    document.getElementById('start-button').style.display = 'none';
    currentMusic.pause();
    currentMusic.currentTime = 0;
    updateScoreDisplay(); // Update score display on disconnect
});

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    camera.position.set(0, 2, 5); // Position camera higher and further back
    camera.lookAt(0, 0, 0);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Create sabers
    sabers.red.object = createSaber(COLORS.red);
    sabers.blue.object = createSaber(COLORS.blue);
    sabers.red.object.position.copy(initialSaberPosition.red);
    sabers.blue.object.position.copy(initialSaberPosition.blue);
    scene.add(sabers.red.object);
    scene.add(sabers.blue.object);

    // Add a ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = -1; // Below the notes
    scene.add(ground);

    window.addEventListener('resize', onWindowResize, false);

    document.getElementById('start-button').addEventListener('click', startGame);

    initAudio();
    updateScoreDisplay(); // Initialize score display
}

function createSaber(color) {
    const group = new THREE.Group();

    // Blade (Cylinder)
    const bladeGeometry = new THREE.CylinderGeometry(0.05, 0.06, 1.0, 8); // Thin cylinder
    const bladeMaterial = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 });
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.y = 0.5; // Position blade above the hilt
    group.add(blade);

    // Hilt (Box) - more like a handle
    const hiltGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
    const hiltMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const hilt = new THREE.Mesh(hiltGeometry, hiltMaterial);
    hilt.position.y = -0.15; // Position hilt below the blade
    group.add(hilt);

    return group;
}

function createNote(type, direction, zPosition) {
    const noteGroup = new THREE.Group();
    const size = 0.5;
    const boxGeometry = new THREE.BoxGeometry(size, size, size);
    const materialColor = type === NOTE_TYPES.RED ? COLORS.red : COLORS.blue;
    const boxMaterial = new THREE.MeshStandardMaterial({ color: materialColor });
    const note = new THREE.Mesh(boxGeometry, boxMaterial);
    noteGroup.add(note);

    if (direction !== NOTE_DIRECTIONS.ANY) {
        // Create an arrow shape using PlaneGeometry with a texture or custom vertices
        const arrowGeometry = new THREE.PlaneGeometry(size * 0.8, size * 0.8); // Slightly smaller than the box
        const arrowCanvas = document.createElement('canvas');
        arrowCanvas.width = 64;
        arrowCanvas.height = 64;
        const ctx = arrowCanvas.getContext('2d');

        // Draw an arrow
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(32, 5);
        ctx.lineTo(54, 40);
        ctx.lineTo(40, 40);
        ctx.lineTo(40, 59);
        ctx.lineTo(24, 59);
        ctx.lineTo(24, 40);
        ctx.lineTo(10, 40);
        ctx.closePath();
        ctx.fill();

        const arrowTexture = new THREE.CanvasTexture(arrowCanvas);
        const arrowMaterial = new THREE.MeshBasicMaterial({ map: arrowTexture, transparent: true, side: THREE.DoubleSide });
        const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);

        arrowMesh.position.z = size / 2 + 0.01; // Slightly in front of the box face
        
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
    }

    noteGroup.position.z = zPosition;
    noteGroup.position.y = 0.5; // Notes appear at a consistent height
    noteGroup.position.x = (Math.random() < 0.5 ? -1 : 1) * (Math.floor(Math.random() * 2) * 0.5 + 0.5); // Randomly place left or right, further from center
    noteGroup.userData = { type, direction, hit: false, originalPosition: noteGroup.position.clone() }; // Store original position for slicing
    scene.add(noteGroup);
    notes.push(noteGroup);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startGame() {
    gameStarted = true;
    document.getElementById('overlay').style.display = 'none';
    currentMusic.play();
    score = 0;
    combo = 0; // Reset combo
    updateScoreDisplay(); // Update display
    currentNoteSpeed = noteSpeed; // Reset speed for new game
    // Clear any existing notes
    notes.forEach(note => scene.remove(note));
    notes = [];
    spawnNotes(); // Start spawning notes
}

let lastNoteSpawnTime = 0;
let noteSpawnInterval = 1000; // milliseconds, initial interval

function spawnNotes() {
    if (!gameStarted) return;

    // Adjust spawn interval based on current speed
    noteSpawnInterval = Math.max(300, 1000 - (currentNoteSpeed - noteSpeed) * 10000); // Faster speed, smaller interval

    setInterval(() => {
        if (!gameStarted) return;
        const type = Math.random() < 0.5 ? NOTE_TYPES.RED : NOTE_TYPES.BLUE;
        const directions = Object.values(NOTE_DIRECTIONS);
        const direction = directions[Math.floor(Math.random() * directions.length)];
        createNote(type, direction, -20); // Spawn far back
    }, noteSpawnInterval);
}

function update() {
    requestAnimationFrame(update);
    TWEEN.update(); // Update TWEEN animations

    if (gameStarted) {
        // console.log("Game is running, rendering scene..."); // Add this for debugging
        currentNoteSpeed += speedIncreaseFactor; // Gradually increase speed

        // Update note positions
        for (let i = notes.length - 1; i >= 0; i--) {
            const note = notes[i];
            note.position.z += currentNoteSpeed; // Move notes towards the player

            if (note.position.z > camera.position.z + 1) { // If note passes the player
                if (!note.userData.hit) {
                    console.log("Missed a note!");
                    playSound(missSoundBuffer, 0.7); // Play miss sound
                    combo = 0; // Reset combo on miss
                    updateScoreDisplay();
                }
                scene.remove(note);
                notes.splice(i, 1);
            }
        }

        handleGamepadInput();
        checkCollisions();

        // Combo reset logic based on time
        if (combo > 0 && performance.now() - lastHitTime > maxComboResetTime) {
            combo = 0;
            updateScoreDisplay();
        }
    }

    renderer.render(scene, camera);
}

function handleGamepadInput() {
    if (!controllerConnected || gamePadIndex === null) return;

    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[gamePadIndex];

    if (!gamepad) return;

    // Left joystick for red saber (axes[0] x, axes[1] y)
    const leftX = gamepad.axes[0];
    const leftY = gamepad.axes[1];
    sabers.red.targetPosition.x = leftX;
    sabers.red.targetPosition.y = -leftY;

    // Right joystick for blue saber (axes[2] x, axes[3] y)
    const rightX = gamepad.axes[2];
    const rightY = gamepad.axes[3];
    sabers.blue.targetPosition.x = rightX;
    sabers.blue.targetPosition.y = -rightY;

    // Smooth saber movement towards target positions
    sabers.blue.object.position.lerp(sabers.blue.targetPosition, SABER_SMOOTHING);
    sabers.red.object.position.lerp(sabers.red.targetPosition, SABER_SMOOTHING);

    // Keep sabers somewhat in front of the camera, maybe slightly behind the notes' hit point
    sabers.blue.object.position.z = -1;
    sabers.red.object.position.z = -1;

    // Clamp saber positions to a reasonable area
    const playAreaX = 3; // Max X distance from center
    const playAreaY = 2; // Max Y distance from center
    sabers.red.object.position.x = Math.max(-playAreaX, Math.min(playAreaX, sabers.red.object.position.x));
    sabers.red.object.position.y = Math.max(-playAreaY, Math.min(playAreaY, sabers.red.object.position.y));
    sabers.blue.object.position.x = Math.max(-playAreaX, Math.min(playAreaX, sabers.blue.object.position.x));
    sabers.blue.object.position.y = Math.max(-playAreaY, Math.min(playAreaY, sabers.blue.object.position.y));

    // Optionally: Button presses for saber rotation (if needed for direction hits)
    // This is a simplified version, real Beat Saber uses movement direction for hits.
}

function checkCollisions() {
    const saberHitTolerance = 0.5; // Adjusted tolerance for better hit detection
    const hitZPosition = -0.5; // Z-position where notes are considered "hittable"

    // Create a bounding box for each saber, more accurately representing its shape
    const redSaberBox = new THREE.Box3().setFromObject(sabers.red.object);
    const blueSaberBox = new THREE.Box3().setFromObject(sabers.blue.object);

    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        if (note.userData.hit) continue; // Skip already hit notes

        // Check if note is within the hittable Z range
        if (note.position.z > hitZPosition - saberHitTolerance && note.position.z < hitZPosition + saberHitTolerance) {
            const noteBox = new THREE.Box3().setFromObject(note);

            let hit = false;
            let saberHit = null;
            let hitSaberColor = null;

            // Use intersectsBox for precise box-to-box collision
            if (note.userData.type === NOTE_TYPES.RED && redSaberBox.intersectsBox(noteBox)) {
                saberHit = sabers.red.object;
                hitSaberColor = NOTE_TYPES.RED;
                hit = true;
            } else if (note.userData.type === NOTE_TYPES.BLUE && blueSaberBox.intersectsBox(noteBox)) {
                saberHit = sabers.blue.object;
                hitSaberColor = NOTE_TYPES.BLUE;
                hit = true;
            }

            if (hit) {
                // Determine the direction of the saber swing
                // For simplification, we'll use a basic approach for now.
                // A more advanced system would track previous saber positions to get a true velocity vector.
                let saberVelocity = new THREE.Vector3();
                // Ensure userData.lastPosition exists before calculating velocity
                if (saberHit === sabers.red.object && sabers.red.object.userData.lastPosition) {
                    saberVelocity.subVectors(sabers.red.object.position, sabers.red.object.userData.lastPosition);
                } else if (saberHit === sabers.blue.object && sabers.blue.object.userData.lastPosition) {
                    saberVelocity.subVectors(sabers.blue.object.position, sabers.blue.object.userData.lastPosition);
                }
                saberVelocity.normalize();

                const requiredDirection = note.userData.direction;
                let directionMatch = false;

                if (requiredDirection === NOTE_DIRECTIONS.ANY) {
                    directionMatch = true; // Dot notes can be hit from any direction
                } else {
                    // Calculate dot product for direction matching
                    const threshold = 0.5; // How strict the direction match is
                    let targetDirectionVector = new THREE.Vector3();
                    switch (requiredDirection) {
                        case NOTE_DIRECTIONS.UP:    targetDirectionVector.set(0, 1, 0); break;
                        case NOTE_DIRECTIONS.DOWN:  targetDirectionVector.set(0, -1, 0); break;
                        case NOTE_DIRECTIONS.LEFT:  targetDirectionVector.set(-1, 0, 0); break;
                        case NOTE_DIRECTIONS.RIGHT: targetDirectionVector.set(1, 0, 0); break;
                    }
                    // Check if saber velocity is aligned with the target direction
                    if (saberVelocity.dot(targetDirectionVector) > threshold) {
                        directionMatch = true;
                    }
                }

                if (directionMatch) {
                    console.log("Hit a note!");
                    note.userData.hit = true;
                    score++;
                    combo++; // Increment combo on hit
                    lastHitTime = performance.now(); // Update last hit time
                    updateScoreDisplay(); // Update display
                    playSound(hitSoundBuffer); // Play hit sound
                    
                    // Slice animation
                    animateSlice(note, saberHit, hitSaberColor);

                } else {
                    // Missed due to wrong direction (if implemented)
                    console.log("Wrong direction hit!");
                    playSound(missSoundBuffer, 0.7); // Play miss sound for wrong direction
                    combo = 0; // Reset combo on wrong direction hit
                    updateScoreDisplay();
                    // Still remove the note to avoid multiple hits
                    note.userData.hit = true;
                    new TWEEN.Tween(note.scale)
                        .to({ x: 0, y: 0, z: 0 }, 200)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .onComplete(() => {
                            scene.remove(note);
                            notes.splice(notes.indexOf(note), 1);
                        })
                        .start();
                }
            }
        }
    }
    // Update last positions for velocity calculation in next frame
    sabers.red.object.userData.lastPosition = sabers.red.object.position.clone();
    sabers.blue.object.userData.lastPosition = sabers.blue.object.position.clone();
}

function animateSlice(note, saber, saberColor) {
    // Remove the original note
    scene.remove(note);
    notes.splice(notes.indexOf(note), 1);

    // Create two new half-notes
    const halfSize = 0.25; // Half of original note size 0.5
    const originalColor = note.children[0].material.color.getHex(); // Get original color

    // Create two separate meshes for the halves
    const halfGeometry = new THREE.BoxGeometry(halfSize, halfSize, halfSize);
    const halfMaterial = new THREE.MeshStandardMaterial({ color: originalColor });

    const half1 = new THREE.Mesh(halfGeometry, halfMaterial);
    const half2 = new THREE.Mesh(halfGeometry, halfMaterial);

    // Position them relative to the original note's center
    // Determine slice direction based on saber's velocity/angle (simplified for now)
    const sliceOffset = 0.2; // How far apart the halves move initially

    // Simple slice simulation: assume a horizontal slice for now
    // A more complex system would calculate slice plane based on saber movement
    half1.position.set(note.position.x, note.position.y + sliceOffset, note.position.z);
    half2.position.set(note.position.x, note.position.y - sliceOffset, note.position.z);

    // Add them to the scene
    scene.add(half1);
    scene.add(half2);

    // Animate the halves moving away and fading out
    new TWEEN.Tween(half1.position)
        .to({ x: half1.position.x + Math.random() * 2 - 1, y: half1.position.y + Math.random() * 2 - 1, z: half1.position.z + 2 }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    new TWEEN.Tween(half2.position)
        .to({ x: half2.position.x + Math.random() * 2 - 1, y: half2.position.y - Math.random() * 2 + 1, z: half2.position.z + 2 }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(half1.material)
        .to({ opacity: 0 }, 600)
        .onUpdate(() => {
            half1.material.transparent = true;
        })
        .onComplete(() => {
            scene.remove(half1);
        })
        .start();
    new TWEEN.Tween(half2.material)
        .to({ opacity: 0 }, 600)
        .onUpdate(() => {
            half2.material.transparent = true;
        })
        .onComplete(() => {
            scene.remove(half2);
        })
        .start();
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

init();
update(); // Start the game loop
