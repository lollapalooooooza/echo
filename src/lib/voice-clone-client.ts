"use client";

export const MIN_VOICE_CLONE_DURATION_SECS = 30;
export const MAX_VOICE_CLONE_DURATION_SECS = 120;

export function isMp3File(file: File) {
  const type = String(file.type || "").trim().toLowerCase();
  const name = String(file.name || "").trim().toLowerCase();

  return type === "audio/mpeg" || type === "audio/mp3" || name.endsWith(".mp3");
}

async function readAudioDuration(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = new Audio();

      const cleanup = () => {
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(objectUrl);
      };

      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const durationSecs = Number(audio.duration);
        cleanup();

        if (!Number.isFinite(durationSecs) || durationSecs <= 0) {
          reject(new Error("We could not read the MP3 duration. Try a different file."));
          return;
        }

        resolve(durationSecs);
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("We could not read that MP3 file. Try exporting it again."));
      };
      audio.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function validateVoiceCloneFile(file: File) {
  if (!isMp3File(file)) {
    throw new Error("Upload an MP3 sample between 30 seconds and 2 minutes.");
  }

  const durationSecs = await readAudioDuration(file);

  if (durationSecs < MIN_VOICE_CLONE_DURATION_SECS || durationSecs > MAX_VOICE_CLONE_DURATION_SECS) {
    throw new Error("Your MP3 sample must be between 30 seconds and 2 minutes.");
  }

  return { durationSecs };
}
