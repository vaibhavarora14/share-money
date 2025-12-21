import { StyleSheet } from "react-native";


export const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  list: {
    gap: 8, // Spacing between items
  },
  card: {
    borderRadius: 20, // Pill-ish / Large corners
    backgroundColor: 'transparent', // Let list blend or use surface
    overflow: 'hidden',
  },
  pressable: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 48, // Larger touch target/visual
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    width: '100%',
  },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    marginRight: 8,
    fontWeight: '600', // MD3 Title Medium is 500/Medium or 600/SemiBold
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    width: '100%',
  },
  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginTop: 16,
  },
  // Legacy styles (if referenced elsewhere, though unlikely for this component)
  sectionSurface: {},
  sectionContent: {},
});

