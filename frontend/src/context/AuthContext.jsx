import { createContext, useContext } from 'react';

const AuthContext = createContext({ user: null, permissions: [], hasPermission: () => false, isAdmin: false });


export { AuthContext };
export const useAuth = () => useContext(AuthContext);
