import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
  type CameraCapturedPicture,
} from "expo-camera";
import { ArrowLeft, SwitchCamera, X } from "lucide-react-native";
import { supabase } from "@/supabase";
import { createPost, newPost, uploadPhoto } from "@/create/post";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Taking a photo and posting it — the phone's first creation flow.
 *
 * The web's audit named this as the biggest native payoff after video:
 * the WebView could not read the camera permission state, and worked
 * around a 3x zoom crop with `resizeMode: "none"`. Neither problem
 * exists here, because the camera is the platform's.
 *
 * Permission is asked for ON THE SCREEN, not at launch: a phone that
 * demands the camera before showing anything is one people refuse. If it
 * is denied the screen says what that means and offers Settings, rather
 * than showing a black rectangle.
 *
 * The capture is taken at reduced quality rather than shrunk afterwards.
 * The web fits a photo inside an edge limit with a canvas, which turns a
 * 3-6MB frame into about a megabyte; there is no canvas here and doing it
 * properly wants an image library, so this is a smaller lever on the same
 * problem and is stated as one.
 *
 * **Video is NOT captured here yet**, even though expo-camera can: a Shot
 * needs a trim, a poster frame and an upload that survives the app being
 * backgrounded, and a record button that produced an untrimmed clip with
 * no thumbnail would be worse than no record button.
 */

/** Enough for a feed photo, small enough not to be a multi-megabyte upload. */
const CAPTURE_QUALITY = 0.7;

type Stage =
  | { kind: "camera" }
  | { kind: "review"; photo: CameraCapturedPicture }
  | { kind: "posting" };

export default function Create() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [stage, setStage] = useState<Stage>({ kind: "camera" });
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<CameraView>(null);

  const take = useCallback(async () => {
    setError(null);
    const shot = await camera.current?.takePictureAsync({ quality: CAPTURE_QUALITY });
    if (!shot) {
      setError("The camera did not return a photo. Try again.");
      return;
    }
    setStage({ kind: "review", photo: shot });
  }, []);

  const post = useCallback(async () => {
    if (stage.kind !== "review") return;
    setError(null);
    setStage({ kind: "posting" });

    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        router.replace("/");
        return;
      }

      /*
       * Read as bytes. supabase-js cannot take a React Native file object
       * and uploads zero bytes if handed one — and that failure is
       * invisible: the upload succeeds and the post appears with a broken
       * picture. `fetch` on a file:// uri is how the bytes are got.
       */
      const response = await fetch(stage.photo.uri);
      const file = await response.arrayBuffer();

      const uploaded = await uploadPhoto(supabase as never, {
        userId: data.user.id,
        file,
        contentType: "image/jpeg",
        ext: "jpg",
      });
      if ("error" in uploaded) {
        setError(uploaded.error);
        setStage({ kind: "review", photo: stage.photo });
        return;
      }

      const written = await createPost(
        supabase as never,
        newPost({ userId: data.user.id, caption, urls: [uploaded.url] }),
      );
      if ("error" in written) {
        setError(written.error);
        setStage({ kind: "review", photo: stage.photo });
        return;
      }

      // Home, where it will be at the top. `replace` rather than `push`:
      // going back to a camera holding a photo that has been posted is a
      // way to post it twice.
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post that.");
      if (stage.kind === "review") setStage({ kind: "review", photo: stage.photo });
    }
  }, [stage, caption]);

  if (!permission) {
    return (
      <View style={[base.screen, base.centre]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[base.screen, base.centre, { paddingTop: insets.top }]}>
        <Text style={base.title}>Hypefy needs the camera</Text>
        <Text style={[base.body, styles.gap]}>
          {permission.canAskAgain
            ? "To take a photo for a post, Hypefy needs permission to use the camera."
            : "Camera access is turned off for Hypefy. You can turn it back on in your phone's settings."}
        </Text>
        {permission.canAskAgain && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allow the camera"
            style={styles.primary}
            onPress={() => void requestPermission()}
          >
            <Text style={styles.primaryText}>Allow the camera</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.secondary}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (stage.kind === "camera") {
    return (
      <View style={styles.full}>
        <CameraView ref={camera} style={styles.full} facing={facing} />
        <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the camera"
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.round}
          >
            <X size={22} color={palette.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={facing === "back" ? "Switch to the front camera" : "Switch to the back camera"}
            hitSlop={10}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            style={styles.round}
          >
            <SwitchCamera size={22} color={palette.foreground} />
          </Pressable>
        </View>

        {error && <Text style={[styles.error, { bottom: insets.bottom + 140 }]}>{error}</Text>}

        <View style={[styles.shutterRow, { paddingBottom: insets.bottom + 32 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
            onPress={() => void take()}
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterDown]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    );
  }

  const photo = stage.kind === "review" ? stage.photo : null;
  const busy = stage.kind === "posting";

  return (
    <KeyboardAvoidingView
      style={base.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the camera"
          hitSlop={10}
          disabled={busy}
          onPress={() => setStage({ kind: "camera" })}
          style={styles.back}
        >
          <ArrowLeft size={22} color={palette.foreground} />
        </Pressable>
        <Text style={styles.barTitle}>New post</Text>
        <View style={styles.back} />
      </View>

      {photo && (
        <Image
          source={{ uri: photo.uri }}
          style={styles.preview}
          resizeMode="cover"
          accessibilityLabel="The photo you just took"
        />
      )}

      <View style={styles.composer}>
        {error && <Text style={styles.composerError}>{error}</Text>}
        <TextInput
          accessibilityLabel="Caption"
          placeholder="Say something about it…"
          placeholderTextColor={palette.faint}
          value={caption}
          onChangeText={setCaption}
          editable={!busy}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={() => void post()}
          style={({ pressed }) => [styles.primary, busy && styles.busy, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={palette.accentInk} />
          ) : (
            <Text style={styles.primaryText}>Post</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: "#000000" },

  topRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  round: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },

  shutterRow: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterDown: { opacity: 0.7 },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.foreground,
  },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  barTitle: { color: palette.foreground, fontFamily: family.bold, fontSize: type.base },

  preview: { width: "100%", aspectRatio: 1, backgroundColor: palette.elevated },

  composer: { padding: 16, gap: 12 },
  input: {
    minHeight: 80,
    maxHeight: 160,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
  },
  composerError: { color: palette.danger, fontFamily: family.normal, fontSize: type.xs },

  primary: {
    marginTop: 8,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    paddingHorizontal: 22,
    minWidth: 140,
    alignSelf: "center",
  },
  busy: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.98 }] },
  primaryText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },

  secondary: { marginTop: 10, minHeight: 44, justifyContent: "center", paddingHorizontal: 22 },
  secondaryText: { color: palette.muted, fontFamily: family.medium, fontSize: type.sm },

  error: {
    position: "absolute",
    left: 24,
    right: 24,
    color: palette.danger,
    fontFamily: family.medium,
    fontSize: type.sm,
    textAlign: "center",
  },
  gap: { marginTop: 10 },
});
