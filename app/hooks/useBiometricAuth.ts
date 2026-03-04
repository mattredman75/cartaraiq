import { useCallback, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { getItem, setItem, deleteItem } from "../lib/storage";

interface BiometricCredentials {
  email: string;
  password: string;
  biometricType?: string | null; // 'faceId' | 'touchId' | 'iris' | 'fingerprint'
  pinHash?: string; // For PIN fallback
}

const PIN_SALT = "cartaraiq_secure_pin_salt_2024";

export function useBiometricAuth() {
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if biometric authentication is available on device
  const checkBiometricAvailability = useCallback(async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        setIsBiometricAvailable(false);
        return false;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(enrolled);

      if (enrolled) {
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        const typeNames: string[] = [];

        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
          )
        ) {
          typeNames.push("faceId");
        }
        if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          typeNames.push(Platform.OS === "ios" ? "touchId" : "fingerprint");
        }
        if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          typeNames.push("iris");
        }

        setBiometricType(typeNames.join("/"));
      }

      return enrolled;
    } catch (err) {
      setError(`Error checking biometric availability: ${err}`);
      setIsBiometricAvailable(false);
      return false;
    }
  }, []);

  // Authenticate using biometric
  const authenticateWithBiometric = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to access CartaraIQ",
        disableDeviceFallback: false,
        fallbackLabel: "Use PIN instead",
      });
      if (!result.success) {
        if (
          result.error === "user_cancel" ||
          result.error === "system_cancel"
        ) {
          setError("Biometric authentication was cancelled.");
        } else if (result.error === "user_fallback") {
          setError("Biometric authentication failed, please use PIN.");
        } else {
          setError(`Biometric authentication failed: ${result.error}`);
        }
        return false;
      }
      return true;
    } catch (err) {
      setError(`Biometric authentication failed: ${err}`);
      setLoading(false);
      return false;
    }
  }, []);

  // Store biometric credentials securely
  const storeBiometricCredentials = useCallback(
    async (email: string, password: string, pinHash?: string) => {
      try {
        const credentials: BiometricCredentials = {
          email,
          password,
          biometricType,
          pinHash,
        };
        await setItem("biometric_credentials", JSON.stringify(credentials));
        await setItem("biometric_enabled", "true");
        await setItem("pin_enabled", "true");
        return true;
      } catch (err) {
        setError(`Failed to store credentials: ${err}`);
        return false;
      }
    },
    [biometricType],
  );

  // Retrieve biometric credentials
  const getBiometricCredentials =
    useCallback(async (): Promise<BiometricCredentials | null> => {
      try {
        const credentialsJson = await getItem("biometric_credentials");
        if (!credentialsJson) return null;
        return JSON.parse(credentialsJson);
      } catch (err) {
        setError(`Failed to retrieve credentials: ${err}`);
        return null;
      }
    }, []);

  // Check if biometric login is enabled
  const isBiometricEnabled = useCallback(async (): Promise<boolean> => {
    try {
      const enabled = await getItem("biometric_enabled");
      return enabled === "true";
    } catch {
      return false;
    }
  }, []);

  // Disable biometric login (preserves credentials so PIN still works)
  const disableBiometricLogin = useCallback(async () => {
    try {
      await setItem("biometric_enabled", "false");
      // Auto-enable PIN when biometric is turned off so the user still has a fast-login method
      await setItem("pin_enabled", "true");
      return true;
    } catch (err) {
      setError(`Failed to disable biometric: ${err}`);
      return false;
    }
  }, []);

  // Check if PIN login is independently enabled
  const isPinEnabled = useCallback(async (): Promise<boolean> => {
    try {
      const pinEnabledStr = await getItem("pin_enabled");
      if (pinEnabledStr !== null) return pinEnabledStr === "true";
      // Backward-compat: treat existing biometric_enabled=true as PIN also enabled
      const biometricEnabledStr = await getItem("biometric_enabled");
      return biometricEnabledStr === "true";
    } catch {
      return false;
    }
  }, []);

  // Enable PIN login
  const enablePin = useCallback(async (): Promise<boolean> => {
    try {
      await setItem("pin_enabled", "true");
      return true;
    } catch {
      return false;
    }
  }, []);

  // Disable PIN login
  const disablePin = useCallback(async (): Promise<boolean> => {
    try {
      await setItem("pin_enabled", "false");
      return true;
    } catch {
      return false;
    }
  }, []);

  // Secure PIN hash function using SHA-256
  // Check if PIN login is independently enabled
  const isPinEnabled = useCallback(async (): Promise<boolean> => {
    try {
      const pinEnabledStr = await getItem("pin_enabled");
      if (pinEnabledStr !== null) return pinEnabledStr === "true";
      // Backward-compat: treat existing biometric_enabled=true as PIN also enabled
      const biometricEnabledStr = await getItem("biometric_enabled");
      return biometricEnabledStr === "true";
    } catch {
      return false;
    }
  }, []);

  // Enable PIN login
  const enablePin = useCallback(async (): Promise<boolean> => {
    try {
      await setItem("pin_enabled", "true");
      return true;
    } catch {
      return false;
    }
  }, []);

  // Disable PIN login
  const disablePin = useCallback(async (): Promise<boolean> => {
    try {
      await setItem("pin_enabled", "false");
      return true;
    } catch {
      return false;
    }
  }, []);

  const hashPin = useCallback(async (pin: string): Promise<string> => {
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pin + PIN_SALT,
    );
    return hash;
  }, []);

  // Verify PIN
  const verifyPin = useCallback(
    async (providedPin: string): Promise<boolean> => {
      try {
        const credentials = await getBiometricCredentials();
        if (!credentials?.pinHash) return false;

        const hash = await hashPin(providedPin);
        return hash === credentials.pinHash;
      } catch (err) {
        setError(`PIN verification failed: ${err}`);
        return false;
      }
    },
    [getBiometricCredentials, hashPin],
  );

  return {
    isBiometricAvailable,
    biometricType,
    error,
    loading,
    checkBiometricAvailability,
    authenticateWithBiometric,
    storeBiometricCredentials,
    getBiometricCredentials,
    isBiometricEnabled,
    disableBiometricLogin,
    isPinEnabled,
    enablePin,
    disablePin,
    hashPin,
    verifyPin,
  };
}
