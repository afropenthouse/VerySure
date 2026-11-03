import * as Location from "expo-location";
import { Coordinates } from "./domain";
export async function bestEffortLocation(): Promise<Coordinates | undefined> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), 3500),
      ),
    ]);
    return position
      ? {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
      : undefined;
  } catch {
    return;
  }
}
