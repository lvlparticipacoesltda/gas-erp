module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo (SDK 56) injeta automaticamente o plugin do
  // react-native-worklets/reanimated quando o pacote está instalado.
  return {
    presets: ['babel-preset-expo'],
  };
};
