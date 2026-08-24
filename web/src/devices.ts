export interface DeviceLists {
  cams: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

export async function listAudioVideoDevices(): Promise<DeviceLists> {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return {
    cams: devs.filter((d) => d.kind === "videoinput"),
    mics: devs.filter((d) => d.kind === "audioinput"),
  };
}

/**
 * Pick the device to use: the saved one if still present, otherwise the
 * first available. Returns undefined when there is no device of that kind.
 */
export function pickDevice(
  devs: MediaDeviceInfo[],
  savedId: string | null
): string | undefined {
  if (savedId && devs.some((d) => d.deviceId === savedId)) return savedId;
  return devs[0]?.deviceId;
}

export function deviceLabel(d: MediaDeviceInfo, index: number): string {
  return d.label || `${d.kind === "videoinput" ? "Camera" : "Microphone"} ${index + 1}`;
}
