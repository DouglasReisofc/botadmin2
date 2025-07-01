function validarTamanhoArquivo(input) {
    const file = input.files[0];
    if (file && file.size > 60 * 1024 * 1024) {
        alert('O arquivo excede o limite de 60MB.');
        input.value = '';
    }
}
