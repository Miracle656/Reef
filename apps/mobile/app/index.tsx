import { useState } from "react";
import { FlatList, Image, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildCreatePostTx, type Post } from "@umbra/core";
import { isConfigured, umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { pickImage, uploadImage, type PickedImage } from "@/lib/media";
import { trpc } from "@/lib/trpc";
import { Button, Card, Field } from "@/components/ui";
import { PostCard } from "@/components/post-card";

export default function Home() {
  const { address, configured, signIn, signOut, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const run = useGasless();

  const profile = useQuery({
    queryKey: ["profile-by-addr", address],
    queryFn: () => trpc.profileByAddress.query({ address: address! }),
    enabled: Boolean(address),
  });
  const feed = useQuery({
    queryKey: ["feed", address],
    queryFn: () => trpc.feed.query({ address: address! }),
    enabled: Boolean(address && profile.data),
  });

  const [text, setText] = useState("");
  const [image, setImage] = useState<PickedImage | null>(null);
  const post = useMutation({
    mutationFn: async () => {
      const media: string[] = [];
      if (image) media.push(await uploadImage(image));
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
    },
    onSuccess: async () => {
      setText("");
      setImage(null);
      await qc.invalidateQueries({ queryKey: ["feed", address] });
    },
  });

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between border-b-2 border-border-strong px-4 py-3">
        <Text className="text-xl font-bold text-ink">umbra</Text>
        {address ? (
          <Text onPress={signOut} className="text-sm font-medium text-ink-soft">
            Sign out
          </Text>
        ) : null}
      </View>

      {!address ? (
        <View className="flex-1 justify-center gap-4 px-6">
          <Text className="text-3xl font-bold text-ink">The social layer of Sui.</Text>
          <Text className="text-ink-soft">Own your identity and audience — no seed phrases, no gas.</Text>
          {!isConfigured ? <Text className="text-danger">Set EXPO_PUBLIC_UMBRA_PACKAGE_ID to enable.</Text> : null}
          <Button
            label={configured ? "Continue with Google" : "Sign-in not configured"}
            onPress={signIn}
            loading={loading}
            disabled={!configured}
          />
        </View>
      ) : !profile.data ? (
        <View className="flex-1 justify-center gap-4 px-6">
          <Text className="text-2xl font-bold text-ink">One step left</Text>
          <Text className="text-ink-soft">Claim your handle to start posting.</Text>
          <Button label="Set up profile" onPress={() => router.push("/onboarding")} />
        </View>
      ) : (
        <FlatList
          data={feed.data ?? []}
          keyExtractor={(p: Post) => p.id}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={feed.isFetching} onRefresh={() => feed.refetch()} />}
          ListHeaderComponent={
            <Card className="mb-3">
              <Field
                value={text}
                onChangeText={setText}
                placeholder="What's happening in Lagos?"
                multiline
                maxLength={560}
                style={{ minHeight: 60 }}
              />
              {image ? <Image source={{ uri: image.uri }} style={{ height: 120, borderRadius: 10, marginTop: 8 }} /> : null}
              <View className="mt-3 flex-row items-center justify-between">
                <Text onPress={async () => setImage(await pickImage())} className="font-medium text-accent">
                  + Image
                </Text>
                <Button
                  label="Post"
                  onPress={() => post.mutate()}
                  loading={post.isPending}
                  disabled={text.trim().length === 0 && !image}
                />
              </View>
            </Card>
          }
          ListEmptyComponent={
            <Text className="py-12 text-center text-ink-soft">Your feed is quiet. Follow people to fill it up.</Text>
          }
        />
      )}
    </View>
  );
}
