import type { ExpoConfig } from "expo/config";

export default (): ExpoConfig => {
  if (
    ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE || "") &&
    !process.env.EXPO_PUBLIC_API_URL?.startsWith("https://")
  ) {
    throw new Error(
      "Set an HTTPS EXPO_PUBLIC_API_URL for preview/production builds.",
    );
  }

  return {
    name: "Verysure",
    slug: "verysure-mobile",
    scheme: "verysure",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    ios: { supportsTablet: true, bundleIdentifier: "ng.verysure.mobile" },
    android: {
      package: "ng.verysure.mobile",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FAF7F1",
      },
    },
    web: {
      bundler: "metro",
      name: "Verysure",
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow Verysure to scan product codes.",
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Attach product evidence to a counterfeit report.",
          cameraPermission: "Photograph a suspected counterfeit product.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Share your location to help regulators locate counterfeit products.",
        },
      ],
      "expo-secure-store",
    ],
  };
};
