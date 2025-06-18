// Konfigurasi Threshold (sesuaikan setelah kalibrasi)
const EYE_CLOSED_THRESHOLD = 0.02; // Jarak mata (normal: ~0.03-0.05)
const YAWN_THRESHOLD = 0.1; // Jarak bibir (normal: ~0.02-0.05)
const HEAD_NOD_THRESHOLD = 6; // Sudut menunduk (derajat)
const HEAD_TILT_THRESHOLD = 25; // Sudut miring (derajat)

// Counter untuk mengurangi false positive
let eyeClosedCounter = 0;
let yawnCounter = 0;
let headTiltWarningCount = 0;
const COUNTER_RESET_FRAMES = 5; // Reset setelah 5 frame normal

// Elemen DOM
const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const ctx = canvasElement.getContext("2d");
const statusText = document.getElementById("statusText");
const debugText = document.getElementById("debugText");

// Hitung sudut kepala (pitch = menunduk, roll = miring)
function calculateHeadTilt(landmarks) {
  const forehead = landmarks[10]; // Titik dahi
  const chin = landmarks[152]; // Titik dagu
  const leftEar = landmarks[234]; // Telinga kiri
  const rightEar = landmarks[454]; // Telinga kanan

  // Pitch (menunduk/menengadah)
  const deltaYPitch = chin.y - forehead.y;
  const deltaXPitch = chin.x - forehead.x;
  const pitchAngle = (Math.atan2(deltaYPitch, deltaXPitch) * 180) / Math.PI;

  // Roll (miring kiri/kanan)
  const deltaYRoll = rightEar.y - leftEar.y;
  const deltaXRoll = rightEar.x - leftEar.x;
  const rollAngle = (Math.atan2(deltaYRoll, deltaXRoll) * 180) / Math.PI;

  return { pitch: pitchAngle, roll: rollAngle };
}

// Fungsi utama saat hasil deteksi didapat
function onResults(results) {
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      // Gambar landmark wajah (opsional)
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
        color: "#C0C0C070",
        lineWidth: 1,
      });

      // Ambil landmark kunci
      const leftEyeUpper = landmarks[159],
        leftEyeLower = landmarks[145];
      const rightEyeUpper = landmarks[386],
        rightEyeLower = landmarks[374];
      const upperLip = landmarks[13],
        lowerLip = landmarks[14];

      // Hitung fitur
      const leftEyeDist = Math.abs(leftEyeUpper.y - leftEyeLower.y);
      const rightEyeDist = Math.abs(rightEyeUpper.y - rightEyeLower.y);
      const mouthDist = Math.abs(upperLip.y - lowerLip.y);
      const { pitch, roll } = calculateHeadTilt(landmarks);

      // Debug info
      debugText.innerHTML = `
                Mata: ${leftEyeDist.toFixed(4)} | 
                Mulut: ${mouthDist.toFixed(4)} | 
                Pitch: ${pitch.toFixed(1)}° | 
                Roll: ${roll.toFixed(1)}°
            `;

      // Logika deteksi
      let warningMessage = "";

      // 1. Deteksi mata tertutup
      if ((leftEyeDist + rightEyeDist) / 2 < EYE_CLOSED_THRESHOLD) {
        eyeClosedCounter++;
        if (eyeClosedCounter > COUNTER_RESET_FRAMES) {
          warningMessage += "Mata tertutup lama! ";
        }
      } else {
        eyeClosedCounter = Math.max(0, eyeClosedCounter - 1);
      }

      // 2. Deteksi menguap
      if (mouthDist > YAWN_THRESHOLD) {
        yawnCounter++;
        if (yawnCounter > COUNTER_RESET_FRAMES) {
          warningMessage += "Menguap terus! ";
        }
      } else {
        yawnCounter = Math.max(0, yawnCounter - 1);
      }

      // 3. Deteksi postur kepala
      if (Math.abs(pitch - 90) > HEAD_NOD_THRESHOLD) {
        // Normal: ~90°
        headTiltWarningCount++;
        if (headTiltWarningCount > COUNTER_RESET_FRAMES) {
          warningMessage += `Menunduk (${pitch.toFixed(1)}°)! `;
        }
      } else if (Math.abs(roll) > HEAD_TILT_THRESHOLD) {
        headTiltWarningCount++;
        if (headTiltWarningCount > COUNTER_RESET_FRAMES) {
          warningMessage += `Miring (${roll.toFixed(1)}°)! `;
        }
      } else {
        headTiltWarningCount = Math.max(0, headTiltWarningCount - 1);
      }

      // Tampilkan peringatan
      if (warningMessage) {
        statusText.textContent = "WASPADA: " + warningMessage;
        statusText.style.color = "red";
        // Alarm suara (opsional)
        if (
          warningMessage.includes("WASPADA") &&
          !document.getElementById("alarm")
        ) {
          const audio = new Audio(
            "https://soundbible.com/mp3/Elevator-Ding-SoundBible.com-685385892.mp3"
          );
          audio.id = "alarm";
          audio.play();
        }
      } else {
        statusText.textContent = "Normal";
        statusText.style.color = "green";
      }
    }
  }
}

// Inisialisasi MediaPipe Face Mesh
const faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});
faceMesh.onResults(onResults);

// Start kamera
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await faceMesh.send({ image: videoElement });
  },
  width: 640,
  height: 480,
});
camera.start();
