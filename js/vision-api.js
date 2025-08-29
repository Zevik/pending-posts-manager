class VisionAPI {
    constructor(code) {
        this.code = this.giaima(code);
    }
    
    giaima(code) {
       return atob(code);
    }
    
    async extractText(imageUrl) {
        try {
            // Convert image to base64
            const base64Image = await this.getImageBase64(imageUrl);
            if (!base64Image) return null;

            // Prepare request for Google Cloud Vision API
            const requestBody = {
                requests: [{
                    image: {
                        content: base64Image.split(',')[1]
                    },
                    features: [{
                        type: 'TEXT_DETECTION',
                        maxResults: 1
                    }]
                }]
            };

            const localCode = this.code + atob("LWp4b3BV");
            
            // Make API request
            const response = await fetch(
                `https://vision.googleapis.com/v1/images:annotate?key=${localCode}`,
                {
                    method: 'POST',
                    body: JSON.stringify(requestBody),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = await response.json();
            console.log('response-data', data);
            // Extract text from response
            if (data.responses?.[0]?.textAnnotations?.[0]) {
                return data.responses[0].textAnnotations[0].description;
            }

            return null;
        } catch (error) {
            console.error('Vision API Error:', error);
            return null;
        }
    }

    async getImageBase64(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return await this.blobToBase64(blob);
        } catch (error) {
            console.error('Image conversion error:', error);
            return null;
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }
}
