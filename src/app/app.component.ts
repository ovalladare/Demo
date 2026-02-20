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
export class AppComponent {
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

  // Articles Data
  items: any[] = [];
  loadingItems: boolean = false;
  itemsError: string = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    // Recuperar credenciales al cargar la página (Variables de Entorno o local)
    this.url = environment.url || localStorage.getItem('amplifyDemo_url') || '';
    this.companyDb = environment.companyDb || localStorage.getItem('amplifyDemo_companyDb') || '';
    this.username = environment.username || localStorage.getItem('amplifyDemo_username') || '';
    this.password = environment.password || localStorage.getItem('amplifyDemo_password') || '';
  }

  onConnect() {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.url || !this.username || !this.password || !this.companyDb) {
      this.errorMessage = 'Por favor, complete todos los campos de conexión.';
      return;
    }

    this.loading = true;

    // Guardar credenciales para la próxima vez
    localStorage.setItem('amplifyDemo_url', this.url);
    localStorage.setItem('amplifyDemo_companyDb', this.companyDb);
    localStorage.setItem('amplifyDemo_username', this.username);
    localStorage.setItem('amplifyDemo_password', this.password);

    // To bypass CORS both in local demo and production we use a reverse proxy
    // In local we use proxy.conf.json 
    // In production (Amplify) we must setUp a rewrite rule to redirect /b1s/v2 to the SAP URL
    const apiPath = '/b1s/v2';

    const fullUrl = `${apiPath}/Login`;

    const body = {
      CompanyDB: this.companyDb,
      UserName: this.username,
      Password: this.password
    };

    const options: any = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      }),
      responseType: 'text' // Lo pedimos como texto temporalmente para ver el error real
    };

    this.http.post(fullUrl, body, options).subscribe({
      next: (res: any) => {
        let response = res;
        try { response = JSON.parse(res); } catch (e) { }

        this.loading = false;
        this.isConnected = true;
        this.sessionId = response?.SessionId || '';
        this.successMessage = `¡Conexión exitosa a ServiceLayer! SessionId: ${this.sessionId}`;
      },
      error: (err) => {
        this.loading = false;
        console.error("Detalle del Error DEV:", err);
        // Si AWS nos devolvió la página web (index.html) por equivocación del proxy:
        if (err.error && typeof err.error === 'string' && err.error.includes('<html')) {
          this.errorMessage = `Error: Amplify devolvió una página HTML en vez de la conexión a SAP. Verifica que la primera regla de AWS Rewrite sea Source: /b1s/<*> y Target: https://iis.cococolima.com.mx:50000/b1s/<*>`;
        } else if (err.status === 0) {
          this.errorMessage = 'Error de conexión (CORS o fallo de red).';
        } else {
          // Intentar parsear el error real
          let errMsg = err.message;
          try {
            const parsedError = JSON.parse(err.error);
            errMsg = parsedError.error?.message?.value || errMsg;
          } catch (e) {
            errMsg = err.error || errMsg;
          }
          this.errorMessage = `Error Code ${err.status}: ${errMsg.substring(0, 150)}...`;
        }
      }
    });
  }

  fetchItems() {
    this.loadingItems = true;
    this.itemsError = '';

    // We do exactly the same for GET /Items to bypass CORS via proxy
    let apiPath = '/b1s/v2';

    const itemsUrl = `${apiPath}/Items?$top=5&$select=ItemCode,ItemName`;

    const options = {
      withCredentials: true, // Necesario para que el navegador envíe la cookie B1SESSION
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
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
          this.itemsError = 'Error de conexión. Es posible que haya un problema de CORS o con las cookies en ServiceLayer.';
        } else {
          this.itemsError = `Error al obtener artículos: ${err.error?.error?.message?.value || err.message}`;
        }
      }
    });
  }
}

