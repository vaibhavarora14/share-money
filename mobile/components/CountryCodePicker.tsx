import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Portal, Searchbar, Text, useTheme } from "react-native-paper";
import { CountryCode, countryCodes } from "../utils/countryCodes";

interface CountryCodePickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (country: CountryCode) => void;
  selectedCountry?: CountryCode;
}

export const CountryCodePicker: React.FC<CountryCodePickerProps> = ({
  visible,
  onDismiss,
  onSelect,
  selectedCountry,
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) {
      return countryCodes;
    }
    const query = searchQuery.toLowerCase();
    return countryCodes.filter(
      (country) =>
        country.name.toLowerCase().includes(query) ||
        country.dialCode.includes(query) ||
        country.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSelect = (country: CountryCode) => {
    onSelect(country);
    setSearchQuery("");
    onDismiss();
  };

  const renderCountryItem = ({ item }: { item: CountryCode }) => {
    // Compare by country code (e.g., 'US', 'CA') not dial code to avoid
    // multiple countries with same dial code (e.g., +1) showing as selected
    const isSelected = selectedCountry?.code === item.code;
    return (
      <TouchableOpacity
        style={[
          styles.countryItem,
          {
            backgroundColor: isSelected
              ? theme.colors.primaryContainer
              : theme.colors.surface,
            borderBottomColor: theme.colors.outline,
          },
        ]}
        onPress={() => handleSelect(item)}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <View style={styles.countryInfo}>
          <Text
            variant="bodyLarge"
            style={[styles.countryName, { color: theme.colors.onSurface }]}
          >
            {item.name}
          </Text>
          <Text
            variant="bodySmall"
            style={[styles.dialCode, { color: theme.colors.onSurfaceVariant }]}
          >
            {item.dialCode}
          </Text>
        </View>
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        animationType="slide"
        transparent={false}
      >
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <View
            style={[styles.header, { borderBottomColor: theme.colors.outline }]}
          >
            <Text
              variant="headlineSmall"
              style={[styles.title, { color: theme.colors.onSurface }]}
            >
              Select Country Code
            </Text>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <Text variant="bodyLarge" style={{ color: theme.colors.primary }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          <Searchbar
            placeholder="Search country..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
          />

          <FlatList
            data={filteredCountries}
            renderItem={renderCountryItem}
            keyExtractor={(item) => item.code}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontWeight: "bold",
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  searchbar: {
    margin: 16,
    marginBottom: 8,
  },
  searchInput: {
    fontSize: 16,
  },
  list: {
    flex: 1,
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flag: {
    fontSize: 32,
    marginRight: 12,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    fontWeight: "500",
    marginBottom: 2,
  },
  dialCode: {
    fontSize: 14,
  },
  checkmark: {
    fontSize: 20,
    color: "#4CAF50",
    fontWeight: "bold",
  },
});

