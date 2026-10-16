import { useState } from "react";
import { Image, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { buildCreatePostTx } from "@umbra/core";
import { palette } from "@umbra/ui";
import { umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { pickImages, uploadImage, type PickedImage } from "@/lib/media";
import { Field, MONO } from "@/components/ui";
import { toast } from "@/components/toaster";

const MAX = 560;
const MAX_IMAGES = 2;

export default function Compose() {
  const router = useRouter();
  const { address } = useAuth();
  const run = useGasless();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [tokenize, setTokenize] = useState(false);

  const post = useMutation({
    mutationFn: async () => {
      const media: string[] = [];
      for (const img of images) media.push(await uploadImage(img));
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
    },
    onSuccess: () => {
      toast("Posted ✓ — appearing shortly");
      // refetch now + again once the indexer has ingested the post (~4s)
      const bump = () => {
        qc.invalidateQueries({ queryKey: ["feed"] });
        qc.invalidateQueries({ queryKey: ["posts-by-author"] });
      };
      bump();
      setTimeout(bump, 4500);
      router.back();
    },
  });

  const canPost = Boolean(address) && (text.trim().length > 0 || images.length > 0) && !post.isPending;

  async function addImages() {
    const picked = await pickImages(MAX_IMAGES - images.length);
    if (picked.length > 0) setImages((cur) => [...cur, ...picked].slice(0, MAX_IMAGES));
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center justify-between border-b border-border px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text className="text-base text-ink-soft">Cancel</Text>
        </Pressable>
        <Text style={{ fontFamily: "Expose-Bold" }} className="text-lg text-ink">New post</Text>
        <Pressable
          onPress={() => post.mutate()}
          disabled={!canPost}
          className="rounded-full bg-accent px-4 py-1.5"
          style={{ opacity: canPost ? 1 : 0.5 }}
        >
          <Text style={{ fontFamily: "Expose-Bold" }} className="text-sm text-on-accent">{post.isPending ? "…" : "Post"}</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Field
          value={text}
          onChangeText={setText}
          placeholder="What's happening in Lagos?"
          multiline
          autoFocus
          maxLength={MAX}
          style={{ minHeight: 120, borderRadius: 16, borderWidth: 0, backgroundColor: palette.light.surfaceMuted }}
        />

        {images.length > 0 ? (
          <View className="mt-3 flex-row" style={{ gap: 8 }}>
            {images.map((img, i) => (
              <View key={img.uri} style={{ flex: 1 }}>
                <Image
                  source={{ uri: img.uri }}
                  style={{ height: images.length > 1 ? 160 : 220, borderRadius: 16, backgroundColor: palette.light.surfaceMuted }}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  hitSlop={8}
                  accessibilityLabel="Remove image"
                  className="absolute right-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(22,22,26,0.7)" }}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View className="mt-3 flex-row items-center justify-between">
          <Pressable
            onPress={addImages}
            disabled={images.length >= MAX_IMAGES}
            className="flex-row items-center gap-2"
            style={{ opacity: images.length >= MAX_IMAGES ? 0.4 : 1 }}
          >
            <Ionicons name="image-outline" size={20} color={palette.light.accent} />
            <Text className="font-semibold text-accent">Add image</Text>
            {images.length > 0 ? (
              <Text style={{ fontFamily: MONO, fontSize: 11.5 }} className="text-ink-faint">{images.length}/{MAX_IMAGES}</Text>
            ) : null}
          </Pressable>
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.light.inkFaint }}>{text.length}/{MAX}</Text>
        </View>

        <Pressable
          onPress={() => setTokenize((t) => !t)}
          accessibilityRole="switch"
          accessibilityState={{ checked: tokenize }}
          className="mt-4 flex-row items-center justify-between rounded-2xl bg-surface-muted px-3 py-2.5"
        >
          <View className="flex-1 flex-row items-center gap-2 pr-3">
            <Text>🪙</Text>
            <Text className="flex-1 text-sm text-ink">
              <Text style={{ fontFamily: "Expose-Bold" }}>Tokenize</Text> — make this post a tradable coin
            </Text>
          </View>
          <Switch
            value={tokenize}
            onValueChange={setTokenize}
            trackColor={{ true: palette.light.accent }}
          />
        </Pressable>
        {tokenize ? (
          <Text className="mt-1 text-xs text-ink-faint">
            Mints a coin + DEEP pool for this post (you own it) — needs 500 DEEP in your linked wallet. Minting
            engine is the next build; posts normally for now.
          </Text>
        ) : null}

        {post.isError ? (
          <Text className="mt-3 text-sm text-danger">{post.error instanceof Error ? post.error.message : "Failed to post"}</Text>
        ) : null}
        {!address ? <Text className="mt-6 text-center text-sm text-ink-soft">Sign in to post.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
