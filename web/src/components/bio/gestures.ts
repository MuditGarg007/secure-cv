import type { Gesture, Prompt } from "@/server/bio/challenge";
import type { LivenessHint } from "@/server/bio/liveness";
import type { EnrollHint } from "@/server/bio/rules";

// Display text for the capture UI (emoji + label + spoken prompt).

export const GESTURE_UI: Record<Gesture, { emoji: string; label: string; say: string }> = {
  Closed_Fist: { emoji: "✊", label: "Closed fist", say: "Make a fist" },
  Open_Palm: { emoji: "✋", label: "Open palm", say: "Show your open palm" },
  Pointing_Up: { emoji: "☝️", label: "Point up", say: "Point one finger up" },
  Thumb_Up: { emoji: "👍", label: "Thumbs up", say: "Thumbs up" },
  Thumb_Down: { emoji: "👎", label: "Thumbs down", say: "Thumbs down" },
  Victory: { emoji: "✌️", label: "Victory sign", say: "Show two fingers, a victory sign" },
  ILoveYou: { emoji: "🤟", label: "I love you sign", say: "Show the I love you sign: thumb, first and little finger up" },
};

/** Prompt card for any prompt, including the user's own gesture (we never know what it looks like). */
export const PROMPT_UI: Record<Prompt, { emoji: string; label: string; say: string }> = {
  ...GESTURE_UI,
  Custom: { emoji: "🔐", label: "Your own gesture", say: "Show your own secret gesture" },
};

export const LIVENESS_HINT_TEXT: Record<LivenessHint, string> = {
  face_not_visible: "We couldn't see your face clearly. Face the camera in good light, with only you in view.",
  gesture_not_seen:
    "We didn't see every hand sign. Hold each one next to your face until the next one appears, and lower your hand in between.",
  too_slow: "That took too long. Start again and follow the prompts.",
  try_again: "That didn't work. Look straight at the camera and try again.",
};

export const ENROLL_HINT_TEXT: Record<EnrollHint, string> = {
  no_face: "We couldn't find your face in every photo. Center your face in the oval and keep still.",
  multiple_faces: "We saw more than one face. Make sure only you are in view.",
  low_quality: "The photos weren't clear enough. Move a little closer, face a light and keep still.",
  no_hand: "We couldn't see your hand in every capture. Hold it up next to your face, fully in view, until the capture ends.",
  multiple_hands: "We saw two hands. Use one hand for your gesture and keep the other out of view.",
  gesture_unstable:
    "Your gesture looked different each time. Pick a shape you can repeat easily and make it the same way each time.",
};

export const SKIP_WARNING = "Without this, unusual sign-ins get blocked and recovery takes 3 days.";

export function cameraErrorText(kind: string): string {
  switch (kind) {
    case "denied":
      return "Camera access is blocked. Allow the camera for this site in your browser settings, then try again.";
    case "no_camera":
      return "We couldn't find a camera on this device.";
    case "unsupported":
      return "This browser can't use the camera. Try Chrome, Edge, Firefox or Safari.";
    default:
      return "The camera didn't start. Close other apps using it and try again.";
  }
}
