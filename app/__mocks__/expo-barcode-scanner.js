export const BarCodeScanner = {
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
};

export default {
  BarCodeScanner,
};
