import { useCallback, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { getItem, setItem, deleteItem } from "../lib/storage";

interface BiometricCredentials {
  email: string;
  password: string;
  biometricType?: string; // 'faceId' | 'touchId' | 'iris' | 'fingerprint'
  pinHash?: string; // For PIN fallback
}

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
        disableDeviceFallback: false,
        fallbackLabel: "Use PIN instead",
        reason: "Authenticate to access CartaraIQ",
      });

      setLoading(false);
      return result.success;
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

  // Disable biometric login
  const disableBiometricLogin = useCallback(async () => {
    try {
      await deleteItem("biometric_credentials");
      await deleteItem("biometric_enabled");
      return true;
    } catch (err) {
      setError(`Failed to disable biometric: ${err}`);
      return false;
    }
  }, []);

  // Simple PIN hash function (you should use a proper hashing library in production)
  const hashPin = useCallback((pin: string): string => {
    // For now, using a simple hash. Consider using crypto-js or similar for production
    return Buffer.from(pin).toString("base64");
  }, []);

  // Verify PIN
  const verifyPin = useCallback(
    async (providedPin: string): Promise<boolean> => {
      try {
        const credentials = await getBiometricCredentials();
        if (!credentials?.pinHash) return false;

        const hash = hashPin(providedPin);
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
    hashPin,
    verifyPin,
  };
}
