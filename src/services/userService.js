// Mock user service - placeholder file
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const getUserProfile = async () => {
  await delay(500);
  return { message: 'User service placeholder' };
};
