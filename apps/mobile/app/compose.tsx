import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { buildCreatePostTx } from "@umbra/core";
import { palette } from "@umbra/ui";
import { umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { pickImage, uploadImage, type PickedImage } from "@/lib/media";
import { Field } from "@/components/ui";

export default function Compose() {
  const router = useRouter();
  const { address } = useAuth();
  const run = useGasless();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [image, setImage] = useState<PickedImage | null>(null);

  const post = useMutation({
    mutationFn: async () => {
      const media: string[] = [];
      if (image) media.push(await uploadImage(image));
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
    },
    onSuccess: () => {
      const bump = () => {
        qc.invalidateQueries({ queryKey: ["feed"] });
        qc.invalidateQueries({ queryKey: ["posts-by-author"] });
      };
      bump();
      setTimeout(bump, 4500);
      router.back();
    },
  });

  const canPost = Boolean(address) && (text.trim().length > 0 || image) && !post.isPending;

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
          maxLength={560}
          style={{ minHeight: 120, borderRadius: 16, borderWidth: 0, backgroundColor: palette.light.surfaceMuted }}
        />
        {image ? <Image source={{ uri: image.uri }} style={{ height: 220, borderRadius: 16, marginTop: 12 }} /> : null}
        <Pressable onPress={async () => setImage(await pickImage())} className="mt-3 flex-row items-center gap-2">
          <Ionicons name="image-outline" size={20} color={palette.light.accent} />
          <Text className="font-semibold text-accent">{image ? "Change image" : "Add image"}</Text>
        </Pressable>
        {!address ? <Text className="mt-6 text-center text-sm text-ink-soft">Sign in to post.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
