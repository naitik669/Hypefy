import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bottomBarDestinations, DESTINATIONS } from "@hypefy/core/navigation";
import { layout } from "@hypefy/tokens";
import { palette, type, family } from "@/theme";
import { DestinationIcon } from "@/icons";
import { TopBar } from "@/TopBar";

/**
 * The app's navigation, built from the same list the web reads.
 *
 * `@hypefy/core/navigation` exists precisely for this. It was written in
 * Phase 4a, when the desktop rail made the web's navigation two copies of
 * one list, and the comment at the top of it says both the rail and the
 * Expo client would read it. This is that client.
 *
 * The consequence worth stating: adding a destination is now ONE edit in
 * core, and the phone bar, the desktop rail and this bar all gain it. The
 * failure it prevents is the quiet one — a destination added to a list the
 * other client cannot see, so one platform silently offers less than the
 * other and nobody notices until a user asks where something went.
 *
 * Ordering comes from the array, not from the filenames. expo-router orders
 * tabs by the order the <Tabs.Screen> children are declared, so the bar
 * reads Home, Shots, Messages, Profile because core says so.
 */

/** `/home` -> `home`, which is the route file's name. */
function routeName(href: string): string {
  return href.replace(/^\//, "");
}

/**
 * Destinations that are routable but NOT in the bar.
 *
 * Discover is the live one: it has never had a tab, and on the phone it is
 * reached by the compass in the top bar or by swiping right from Home. It
 * still needs a route, so it is registered with `href: null`, which keeps
 * it navigable and keeps it off the bar. That mirrors the web exactly,
 * where `bottomBar: false` and `sideNav: true` say the same thing.
 */
const OFF_BAR = DESTINATIONS.filter((d) => !d.bottomBar && d.href === "/discover");

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bar = bottomBarDestinations();

  return (
    <Tabs
      screenOptions={{
        /*
         * A custom `header` rather than a title and `headerShown`. React
         * Navigation renders what this returns verbatim and applies no
         * safe-area padding of its own, which is what we want — TopBar
         * reads the inset itself and adds it to the token height, the same
         * sum the web writes as calc(var(--top-bar-h) + var(--sat)).
         * Letting the navigator pad too would inset it twice.
         */
        headerShown: true,
        header: () => <TopBar />,
        sceneStyle: { backgroundColor: palette.background },
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.faint,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          // Density-aware: one physical pixel, not 0.5 logical ones.
          borderTopWidth: StyleSheet.hairlineWidth,
          // The bar's own height from tokens, plus the device's inset. The
          // web expresses the same sum as calc() in globals.css; navSpace()
          // in tokens is the shared statement of it, and Placeholder uses
          // that side so the two cannot drift apart unnoticed.
          height: layout.navHeight + Math.max(0, insets.bottom),
          paddingBottom: Math.max(0, insets.bottom),
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: family.medium,
          fontSize: type.tiny,
          // The label sits tight under the icon rather than floating; the
          // web's bar does the same.
          marginTop: 2,
        },
      }}
    >
      {bar.map((d) => (
        <Tabs.Screen
          key={d.href}
          name={routeName(d.href)}
          options={{
            title: d.label,
            tabBarAccessibilityLabel: d.label,
            /*
             * Shots is full-bleed video and takes the whole screen, as it
             * does on the web. A chrome bar sitting over it would cover
             * the top of every clip.
             */
            headerShown: d.href !== "/shots",
            // `color` is nullable in the navigator's own types, so the
            // inactive tint stands in rather than passing null through to
            // a component that would render it as the platform default.
            tabBarIcon: ({ focused, color, size }) => (
              <DestinationIcon
                href={d.href}
                focused={focused}
                color={typeof color === "string" ? color : palette.faint}
                size={size}
              />
            ),
          }}
        />
      ))}

      {OFF_BAR.map((d) => (
        <Tabs.Screen key={d.href} name={routeName(d.href)} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
