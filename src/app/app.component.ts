import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Coco Colima - AWS Amplify Presentation';

  // Connection Form Data
  url: string = '';
  username: string = '';
  password: string = '';
  companyDb: string = '';

  // UI State
  loading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  // App State after connection
  isConnected: boolean = false;
  sessionId: string = '';
  sslWarning: boolean = false;

  // Articles Data
  items: any[] = [];
  loadingItems: boolean = false;
  itemsError: string = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.url = environment.url || localStorage.getItem('amplifyDemo_url') || '';
    this.companyDb = environment.companyDb || localStorage.getItem('amplifyDemo_companyDb') || '';
    this.username = environment.username || localStorage.getItem('amplifyDemo_username') || '';
    this.password = environment.password || localStorage.getItem('amplifyDemo_password') || '';
  }

  /** ¿Estamos en localhost? */
  private isLocalhost(): boolean {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  /** URL base de SAP limpia (sin /b1s/v2 ni trailing slash) */
  private getSapBaseUrl(): string {
    return this.url.trim()
      .replace(/\/b1s\/(v1|v2)\/?$/i, '')
      .replace(/\/$/, '');
  }

  /**
   * Construye la URL final para llamar a SAP.
   * - LOCAL: ruta relativa → proxy.conf.json la redirige a SAP (bypass SSL/CORS local)
   * - PRODUCCIÓN: corsproxy.io como intermediario → request server-to-server
   *   sin restricciones SSL del browser, con headers CORS correctos en la respuesta.
   */
  private buildUrl(sapPath: string): string {
    if (this.isLocalhost()) {
      return `/b1s/v2${sapPath}`;
    }
    const sapBase = this.getSapBaseUrl();
    const fullSapUrl = `${sapBase}/b1s/v2${sapPath}`;
    return `https://corsproxy.io/?url=${encodeURIComponent(fullSapUrl)}`;
  }

  /** URL del servidor SAP para aceptar el certificado si fuera necesario */
  get certAcceptUrl(): string {
    return this.getSapBaseUrl() || 'https://tu-servidor-sap:50000';
  }

  onConnect() {
    this.successMessage = '';
    this.errorMessage = '';
    this.sslWarning = false;

    if (!this.url || !this.username || !this.password || !this.companyDb) {
      this.errorMessage = 'Por favor, complete todos los campos de conexión.';
      return;
    }

    this.loading = true;

    localStorage.setItem('amplifyDemo_url', this.url);
    localStorage.setItem('amplifyDemo_companyDb', this.companyDb);
    localStorage.setItem('amplifyDemo_username', this.username);
    localStorage.setItem('amplifyDemo_password', this.password);

    const loginUrl = this.buildUrl('/Login');

    const body = {
      CompanyDB: this.companyDb,
      UserName: this.username,
      Password: this.password
    };

    const options: any = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      responseType: 'text'
    };

    this.http.post(loginUrl, body, options).subscribe({
      next: (res: any) => {
        let response = res;
        try { response = JSON.parse(res); } catch (e) { }

        this.loading = false;
        this.isConnected = true;
        // SessionId del body → lo usaremos como header B1S-Session en vez de cookie
        this.sessionId = response?.SessionId || '';
        this.successMessage = `¡Conexión exitosa a ServiceLayer! SessionId: ${this.sessionId}`;
      },
      error: (err) => {
        this.loading = false;
        console.error('Error DEV:', err);

        if (err.error && typeof err.error === 'string' && err.error.includes('<html')) {
          this.errorMessage = 'El servidor devolvió HTML en vez de JSON. Verifica la URL de SAP ServiceLayer.';
        } else if (err.status === 0) {
          this.errorMessage = `No se pudo conectar a SAP (Error de red). URL intentada: ${loginUrl}. Verifica que el servidor SAP esté accesible desde internet.`;
        } else {
          let errMsg = err.message;
          try {
            const parsedError = JSON.parse(err.error);
            errMsg = parsedError.error?.message?.value || errMsg;
          } catch (e) {
            errMsg = err.error || errMsg;
          }
          this.errorMessage = `Error SAP (${err.status}): ${(errMsg || '').substring(0, 300)}`;
        }
      }
    });
  }

  fetchItems() {
    this.loadingItems = true;
    this.itemsError = '';

    const itemsUrl = this.buildUrl(`/Items?$top=5&$select=ItemCode,ItemName`);

    // Usamos B1S-Session header con el SessionId del login
    // SAP ServiceLayer soporta autenticación por header además de por cookie
    const options = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'B1S-Session': this.sessionId
      })
    };

    this.http.get(itemsUrl, options).subscribe({
      next: (response: any) => {
        this.loadingItems = false;
        this.items = response?.value || [];
      },
      error: (err) => {
        this.loadingItems = false;
        if (err.status === 0) {
          this.itemsError = `No se pudo obtener artículos. URL intentada: ${itemsUrl}`;
        } else {
          this.itemsError = `Error al obtener artículos (${err.status}): ${err.error?.error?.message?.value || err.message}`;
        }
      }
    });
  }
}
