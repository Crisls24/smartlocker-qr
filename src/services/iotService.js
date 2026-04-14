/**
 * Servicio de simulación IoT para comunicación con ESP32.
 * En un entorno real, esto enviaría comandos via MQTT, WebSockets o HTTP.
 */
class IotService {
    /**
     * Envía una señal de apertura al locker especificado.
     * @param {string} lockerCode - Código identificador del locker.
     * @returns {Promise<boolean>} - Resultado de la operación.
     */
    async openLocker(lockerCode) {
        console.log(`[IoT Service] 📡 ENVIANDO SEÑAL DE APERTURA -> ESP32:Locker(${lockerCode})`);
        
        const delay = process.env.NODE_ENV === 'test' ? 10 : 500;
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`[IoT Service] ✅ CONFIRMACIÓN RECIBIDA -> Locker(${lockerCode}) ABIERTO`);
                resolve(true);
            }, delay);
        });
    }

    /**
     * Envía una señal de cierre al locker especificado.
     * @param {string} lockerCode - Código identificador del locker.
     * @returns {Promise<boolean>} - Resultado de la operación.
     */
    async closeLocker(lockerCode) {
        console.log(`[IoT Service] 📡 ENVIANDO SEÑAL DE CIERRE -> ESP32:Locker(${lockerCode})`);
        
        const delay = process.env.NODE_ENV === 'test' ? 10 : 500;
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`[IoT Service] 🔒 CONFIRMACIÓN RECIBIDA -> Locker(${lockerCode}) CERRADO`);
                resolve(true);
            }, delay);
        });
    }
}

module.exports = new IotService();
